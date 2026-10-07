"""Web interface tests: auth, CSRF, roles, headers, exports, assistant, escaping."""

from datetime import date
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from flowcast.app.assistant import OllamaAssistant, is_private_url, redact
from flowcast.app.config import Settings
from flowcast.app.db import Database
from flowcast.app.exports import validate_template
from flowcast.app.main import create_app
from flowcast.app.security import hash_password
from flowcast.app.state import StoreState
from flowcast.synth import StoreConfig

ADMIN_PW = "Admin-Pass-2026x"


@pytest.fixture(scope="session")
def app_state():
    return StoreState.build(StoreConfig(name="Test Store", state="CO"), days=330, seed=5, folds=3, today=date(2026, 10, 6))


@pytest.fixture
def client(app_state, tmp_path):
    settings = Settings(secret_key="x" * 40, db_path=tmp_path / "t.db", secure_cookies=False, bootstrap_password=ADMIN_PW, store_name="Test Store")
    db = Database(settings.db_path)
    app = create_app(settings, state=app_state, db=db)
    db.create_user("viewer1", hash_password("Viewer-Pass-2026"), "viewer", "V")
    db.create_user("lead1", hash_password("Lead-Pass-2026xx"), "shift_lead", "L")
    c = TestClient(app, follow_redirects=False)
    c.db = db
    return c


def login(c, user="admin", pw=ADMIN_PW):
    r = c.post("/login", data={"username": user, "password": pw})
    assert r.status_code == 303, r.text
    return r


def csrf_of(c, path="/"):
    html = c.get(path).text
    i = html.index('name="csrf_token" value="') + len('name="csrf_token" value="')
    return html[i : i + 64]


def test_pages_require_login(client):
    for path in ("/", "/forecast", "/people", "/ordering", "/assistant", "/admin", "/ordering/export"):
        r = client.get(path)
        assert r.status_code == 303 and r.headers["location"] == "/login", path
    assert client.get("/healthz").status_code == 200


def test_login_cookie_flags_and_lockout(client):
    r = login(client)
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie.replace("Strict", "strict")
    assert client.get("/").status_code == 200
    fresh = TestClient(client.app, follow_redirects=False)
    for _ in range(5):
        assert fresh.post("/login", data={"username": "admin", "password": "wrong"}).status_code == 401
    assert fresh.post("/login", data={"username": "admin", "password": ADMIN_PW}).status_code == 429


def test_security_headers_everywhere(client):
    login(client)
    for path in ("/", "/static/app.css", "/login"):
        h = client.get(path).headers
        csp = h["content-security-policy"]
        assert "default-src 'none'" in csp and "script-src 'self'" in csp and "unsafe-inline" not in csp
        assert h["x-frame-options"] == "DENY" and h["x-content-type-options"] == "nosniff"
        assert h["referrer-policy"] == "no-referrer" and h["cache-control"] == "no-store"
    assert "<script src=\"/static/app.js\">" in client.get("/").text
    assert "https://" not in client.get("/").text.split("<footer")[0].replace("https://claude", "")  # no external assets


def test_all_pages_render_for_admin(client):
    login(client)
    for path in ("/", "/forecast", "/people?as_of=16", "/ordering", "/assistant", "/admin"):
        r = client.get(path)
        assert r.status_code == 200, path
        assert "Test Store" in r.text
    assert "Hold" in client.get("/people").text or "Send home" in client.get("/people").text or "Call in" in client.get("/people").text


def test_csrf_required_and_roles_enforced(client):
    login(client, "lead1", "Lead-Pass-2026xx")
    assert client.post("/people/decision", data={"as_of": 14, "outcome": "followed", "csrf_token": "nope"}).status_code == 403
    tok = csrf_of(client)
    r = client.post("/people/decision", data={"as_of": 14, "outcome": "followed", "note": "ok", "csrf_token": tok})
    assert r.status_code == 303 and "Decision" in r.headers["location"]
    assert client.db.decisions()[0]["outcome"] == "followed"
    # shift lead cannot edit templates or see admin
    assert client.post("/ordering/template", data={"spec": "{}", "csrf_token": tok}).status_code == 403
    assert client.get("/admin").status_code == 403
    v = TestClient(client.app, follow_redirects=False)
    login(v, "viewer1", "Viewer-Pass-2026")
    assert v.get("/").status_code == 200
    vtok = csrf_of(v)
    assert v.post("/people/decision", data={"as_of": 14, "outcome": "followed", "csrf_token": vtok}).status_code == 403
    assert v.get("/ordering/export").status_code == 403


def test_order_export_and_audit(client):
    login(client)
    tok = csrf_of(client, "/ordering")
    r = client.post("/ordering/inventory", data={"csrf_token": tok, "on_hand_chicken_lb": "500", "on_order_chicken_lb": "40"})
    assert r.status_code == 303
    r = client.get("/ordering/export?template=distributor_order_guide&delivery=2026-10-08")
    assert r.status_code == 200 and r.headers["content-disposition"].startswith("attachment")
    lines = r.text.strip().splitlines()
    assert lines[0] == "Store #,Item #,Description,Qty (CS),Delivery Date,Order Type"
    assert any(",CHK-TND-40,chicken_lb," in ln and ",10/08/2026,STD" in ln for ln in lines[1:])
    assert client.get("/ordering/export?template=nope").status_code == 404
    actions = [a["action"] for a in client.db.audit_entries()]
    assert "order_exported" in actions and "inventory_counts" in actions
    # override flows into export
    r = client.post("/ordering/override", data={"csrf_token": tok, "ingredient": "bun", "cases": "3"})
    assert r.status_code == 303
    out = client.get("/ordering/export?template=generic_csv").text
    assert any(ln.startswith("bun,") and ",3," in ln for ln in out.splitlines())


def test_template_validation_and_save(client):
    assert validate_template({"name": "x", "columns": [{"field": "bogus"}]})
    assert not validate_template({"name": "x", "columns": [{"field": "order_cases"}, {"const": "A"}]})
    login(client)
    tok = csrf_of(client, "/ordering")
    bad = client.post("/ordering/template", data={"csrf_token": tok, "spec": '{"name": "t", "columns": [{"field": "nope"}]}'})
    assert "rejected" in unquote(bad.headers["location"])
    good = client.post("/ordering/template", data={"csrf_token": tok, "spec": '{"name": "sysco_tsv", "format": "tsv", "columns": [{"field": "vendor_code", "label": "SKU"}, {"field": "order_cases", "label": "CS"}]}'})
    assert "saved" in unquote(good.headers["location"])
    assert "sysco_tsv" in client.db.templates()
    assert "\t" in client.get("/ordering/export?template=sysco_tsv").text


def test_auto_order_lock(client):
    login(client)
    tok = csrf_of(client, "/ordering")
    r = client.post("/ordering/unlock", data={"csrf_token": tok, "ingredient": "chicken_lb", "enabled": "1"})
    elig = client.app.state.store.auto_order_eligibility()
    if elig["eligible"]:
        assert client.db.auto_unlocks().get("chicken_lb") is True
    else:
        assert "locked" in unquote(r.headers["location"]).lower()
        assert not client.db.auto_unlocks()


def test_assistant_answers_redacts_and_logs(client):
    login(client)
    tok = csrf_of(client, "/assistant")
    for q in ["How are we pacing?", "Who is best at fry?", "What should we order? call me at 303-555-0142 or me@x.com", "Are we short on anyone?", "How accurate is the forecast?", "What does tomorrow look like?", "gibberish question"]:
        assert client.post("/assistant", data={"csrf_token": tok, "question": q}).status_code == 303
    hist = client.db.assistant_history("admin")
    assert len(hist) == 7
    order_q = next(h for h in hist if "order" in h["question"])
    assert "[phone]" in order_q["question"] and "[email]" in order_q["question"] and order_q["redactions"] == 2
    assert all(h["backend"] == "local" and h["answer"] for h in hist)
    assert "I can only answer from this store's data" in hist[-1]["answer"]
    page = client.get("/assistant").text
    assert "303-555" not in page and "[phone]" in page


def test_redaction_and_private_url_policy(app_state):
    text, n = redact("ssn 123-45-6789 card 4111 1111 1111 1111 phone (720) 555-0199 mail a.b@c.io")
    assert n == 4 and "4111" not in text and "0199" not in text
    assert is_private_url("http://127.0.0.1:11434") and is_private_url("http://10.0.0.5:11434") and is_private_url("http://gpu-box.internal:11434")
    assert not is_private_url("https://api.openai.com/v1") and not is_private_url("http://8.8.8.8")
    with pytest.raises(ValueError):
        OllamaAssistant(app_state, "https://api.openai.com/v1", "gpt")


def test_event_changes_forecast_and_is_escaped(client):
    login(client)
    tok = csrf_of(client, "/forecast")
    s = client.app.state.store
    target = (s.today + __import__("pandas").Timedelta(days=2))
    before = float(s.day(target)["forecast"].sum())
    name = "<script>alert(1)</script> game"
    r = client.post("/forecast/events", data={"csrf_token": tok, "name": name, "start": target.strftime("%Y-%m-%dT18:00"), "hours": "3", "attendance": "60000", "distance_mi": "1.0", "category": "sports"})
    assert r.status_code == 303
    after = float(s.day(target)["forecast"].sum())
    assert after > before * 1.05
    html = client.get(f"/forecast?day={target.strftime('%Y-%m-%d')}").text
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;" in html
    ev_id = client.db.manual_events()[0]["id"]
    assert client.post(f"/forecast/events/{ev_id}/delete", data={"csrf_token": tok}).status_code == 303
    assert abs(float(s.day(target)["forecast"].sum()) - before) < 1e-6


def test_admin_creates_users_with_policy(client):
    login(client)
    tok = csrf_of(client, "/admin")
    weak = client.post("/admin/users", data={"csrf_token": tok, "username": "newgm", "display_name": "N", "role": "gm", "password": "short"})
    assert "Password needs" in unquote(weak.headers["location"])
    ok = client.post("/admin/users", data={"csrf_token": tok, "username": "newgm", "display_name": "N", "role": "gm", "password": "Strong-Pass-2026"})
    assert "created" in unquote(ok.headers["location"])
    c2 = TestClient(client.app, follow_redirects=False)
    login(c2, "newgm", "Strong-Pass-2026")
    assert c2.get("/admin").status_code == 403 and c2.get("/ordering").status_code == 200
