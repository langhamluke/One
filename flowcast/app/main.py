"""FastAPI application: routes, auth flow, and page assembly."""

from __future__ import annotations

import json
import logging
import secrets
from datetime import date, timedelta
from pathlib import Path

import jinja2
import pandas as pd
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from flowcast import labor, ordering
from flowcast.app import assistant as assistant_mod
from flowcast.app import charts, exports
from flowcast.app.config import Settings
from flowcast.app.db import Database
from flowcast.app.security import (
    LoginThrottle,
    SecurityHeadersMiddleware,
    SessionManager,
    check_csrf,
    csrf_token,
    current_session,
    hash_password,
    password_policy_errors,
    require_role,
    verify_password,
)
from flowcast.app.state import StoreState
from flowcast.synth import StoreConfig

log = logging.getLogger("flowcast.app")
HERE = Path(__file__).parent
STATIONS = [s.station for s in labor.DEFAULT_STANDARDS]


def create_app(settings: Settings | None = None, *, state: StoreState | None = None, db: Database | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="flowcast", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.secure_cookies)
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    # Autoescape every template, whatever its extension: no raw HTML from data ever reaches the page.
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(HERE / "templates")), autoescape=True)
    templates = Jinja2Templates(env=env)

    app.state.settings = settings
    app.state.db = db or Database(settings.db_path)
    app.state.sessions = SessionManager(settings.secret_key, settings.session_max_age, settings.secure_cookies)
    app.state.throttle = LoginThrottle(app.state.db, settings.login_max_attempts, settings.login_lockout_seconds)
    if settings.generated_secret:
        log.warning("FLOWCAST_SECRET_KEY not set: sessions will not survive a restart.")

    cfg = StoreConfig(name=settings.store_name, lat=settings.store_lat, lon=settings.store_lon, tz=settings.store_tz, state=settings.store_state)
    if state is None:
        log.info("Building store state (this trains the model and runs the backtest)...")
        state = StoreState.build(cfg, data_dir=settings.data_dir, wage=settings.wage)
    app.state.store = state
    _apply_manual_events(app)
    _bootstrap_admin(app)

    for name, spec in exports.BUILTIN_TEMPLATES.items():
        if name not in app.state.db.templates():
            app.state.db.save_template(name, spec, "system")

    def make_assistant():
        if settings.assistant_backend == "ollama":
            return assistant_mod.OllamaAssistant(state, settings.ollama_url, settings.ollama_model)
        return assistant_mod.LocalAssistant(state)

    app.state.assistant = make_assistant()

    # ------------------------------------------------------------------ helpers
    def render(request: Request, name: str, **ctx) -> HTMLResponse:
        session = current_session(request)
        base = {
            "request": request,
            "session": session,
            "csrf": csrf_token(session) if session else "",
            "store": state,
            "store_name": settings.store_name,
            "today": state.today,
            "demo_mode": state.demo_mode,
            "data_notes": state.data.notes,
            "message": request.query_params.get("m", "")[:200],
            "nav": name.split(".")[0],
        }
        return templates.TemplateResponse(request, name, base | ctx)

    def redirect(path: str, message: str | None = None) -> RedirectResponse:
        from urllib.parse import quote
        sep = "&" if "?" in path else "?"
        url = f"{path}{sep}m={quote(message)}" if message else path
        return RedirectResponse(url, status_code=303)

    @app.exception_handler(HTTPException)
    async def on_http_error(request: Request, exc: HTTPException):
        if exc.status_code == 401:
            return RedirectResponse("/login", status_code=303)
        if exc.status_code == 403:
            return PlainTextResponse("Forbidden: " + str(exc.detail), status_code=403)
        return PlainTextResponse(str(exc.detail), status_code=exc.status_code)

    # ------------------------------------------------------------------ auth
    @app.get("/login", response_class=HTMLResponse)
    def login_form(request: Request):
        if current_session(request):
            return RedirectResponse("/", status_code=303)
        return templates.TemplateResponse(request, "login.html", {"request": request, "error": "", "store_name": settings.store_name})

    @app.post("/login")
    def login(request: Request, username: str = Form(...), password: str = Form(...)):
        username = username.strip().lower()[:64]
        db, throttle = app.state.db, app.state.throttle
        if throttle.locked(username):
            db.audit(username, "login_locked", {})
            return templates.TemplateResponse(request, "login.html", {"request": request, "error": "Too many attempts. Try again in a few minutes.", "store_name": settings.store_name}, status_code=429)
        user = db.get_user(username)
        ok = bool(user) and verify_password(password, user["password_hash"])
        db.record_login(username, ok)
        if not ok:
            db.audit(username, "login_failed", {})
            return templates.TemplateResponse(request, "login.html", {"request": request, "error": "Invalid username or password.", "store_name": settings.store_name}, status_code=401)
        token = app.state.sessions.issue(user["username"], user["role"])
        resp = RedirectResponse("/", status_code=303)
        app.state.sessions.set_cookie(resp, token)
        db.audit(username, "login", {"role": user["role"]})
        return resp

    @app.post("/logout")
    def logout(request: Request, csrf_token_field: str = Form(alias="csrf_token")):
        session = require_role(request, "viewer")
        check_csrf(session, csrf_token_field)
        resp = RedirectResponse("/login", status_code=303)
        app.state.sessions.clear_cookie(resp)
        app.state.db.audit(session["u"], "logout", {})
        return resp

    # ------------------------------------------------------------------ pages
    @app.get("/", response_class=HTMLResponse)
    def overview(request: Request):
        require_role(request, "viewer")
        s = state
        live = s.live(as_of_hour=14)
        daily = s.week.groupby("date")[["forecast", "baseline", "low", "high"]].sum().reset_index()
        acc = s.accuracy_by_fold()
        lw = s.last_week_labor()
        alerts = []
        for w in s.overstaff_warnings():
            alerts.append(("warning", f"Overstaffed {pd.Timestamp(w['date']).strftime('%a %-m/%-d')}: 4-week plan carries {w['hours']} more labor hours (${w['dollars']:.0f}) than the forecast needs, at {w['when']}."))
        for w in s.understaff_warnings():
            alerts.append(("serious", f"Understaffed {pd.Timestamp(w['date']).strftime('%a %-m/%-d')}: forecast needs {w['hours']} more labor hours than the 4-week plan, at {w['when']}."))
        for g in s.hiring_needs():
            if g["gap"] > 0:
                alerts.append(("serious", f"{g['station'].replace('_', ' ').title()}: short {g['gap']} qualified people for this week's peaks."))
        elig = s.auto_order_eligibility()
        wp = s.week_plan()
        week_hours = {"model": float(wp["total"].sum()), "baseline": float(wp["baseline_total"].sum())}
        return render(request, "overview.html", week_hours=week_hours,
                      live=live, daily=daily, acc=acc, lw=lw, alerts=alerts, drivers=s.drivers(s.today), ctx=s.day_context(s.today),
                      week_chart=charts.week_columns(daily, "Next 7 days: forecast vs 4-week average"),
                      acc_chart=charts.accuracy_columns(acc, "Daily forecast error by week (lower is better)"),
                      today_chart=charts.hourly_chart(s.day(s.today), "Today by hour", revised=live["table"]["revised"]),
                      summary=s.bt.summary, elig=elig, spark=charts.sparkline(acc["model"].tolist()))

    @app.get("/forecast", response_class=HTMLResponse)
    def forecast(request: Request, day: str | None = None):
        require_role(request, "viewer")
        s = state
        try:
            sel = pd.Timestamp(day) if day else s.today
        except ValueError:
            sel = s.today
        if sel < s.today or sel > s.today + pd.Timedelta(days=6):
            sel = s.today
        days = [s.today + pd.Timedelta(days=i) for i in range(7)]
        contexts = [s.day_context(d) | {"total": float(s.day(d)["forecast"].sum()), "baseline": float(s.day(d)["baseline"].sum())} for d in days]
        d = s.day(sel)
        return render(request, "forecast.html", sel=sel, days=days, contexts=contexts, day=d, drivers=s.drivers(sel),
                      chart=charts.hourly_chart(d, f"{sel.strftime('%A %-m/%-d')} by hour"),
                      cond_chart=charts.condition_bars(s.bt.by_condition, "Hourly error by condition, last backtest"),
                      importance=s.importance.head(12), manual_events=app.state.db.manual_events(),
                      summary=s.bt.summary, nfolds=int(s.bt.predictions["fold"].nunique()))

    @app.post("/forecast/events")
    def add_event(request: Request, csrf_token_field: str = Form(alias="csrf_token"), name: str = Form(...), start: str = Form(...),
                  hours: float = Form(3.0), attendance: int = Form(...), distance_mi: float = Form(...), category: str = Form("other")):
        session = require_role(request, "gm")
        check_csrf(session, csrf_token_field)
        try:
            st = pd.Timestamp(start)
        except ValueError:
            return redirect("/forecast", "Bad start time.")
        if not (0 < hours <= 24) or attendance < 0 or distance_mi < 0:
            return redirect("/forecast", "Check the event numbers.")
        en = st + pd.Timedelta(hours=float(hours))
        category = category if category in ("sports", "concert", "festival", "school", "community", "other") else "other"
        app.state.db.add_event(st.isoformat(), en.isoformat(), name.strip()[:120], int(attendance), float(distance_mi), category, session["u"])
        app.state.db.audit(session["u"], "event_added", {"name": name[:120], "start": st.isoformat(), "attendance": attendance})
        _apply_manual_events(app)
        return redirect("/forecast", "Event added and forecast updated.")

    @app.post("/forecast/events/{event_id}/delete")
    def delete_event(request: Request, event_id: int, csrf_token_field: str = Form(alias="csrf_token")):
        session = require_role(request, "gm")
        check_csrf(session, csrf_token_field)
        app.state.db.delete_event(event_id)
        app.state.db.audit(session["u"], "event_deleted", {"id": event_id})
        _apply_manual_events(app)
        return redirect("/forecast", "Event removed.")

    @app.get("/people", response_class=HTMLResponse)
    def people(request: Request, as_of: int = 14):
        require_role(request, "viewer")
        s = state
        as_of = int(min(max(as_of, s.cfg.open_hour), s.cfg.close_hour))
        live = s.live(as_of_hour=as_of)
        plan = s.week_plan()
        today_plan = plan[plan["date"] == s.today].reset_index(drop=True)
        # Decision math: what the revised forecast says the remaining hours need vs the plan.
        revised = live["table"][["ts", "revised"]].rename(columns={"revised": "forecast"})
        revised_plan = labor.staffing_plan(revised)
        today_plan["revised_total"] = revised_plan["total"].to_numpy()
        remaining = today_plan[today_plan["hour"] >= as_of]
        delta_hours = int((remaining["revised_total"] - remaining["total"]).sum())
        cards = s.cards[s.cards["sufficient_data"]] if not s.cards.empty else s.cards
        return render(request, "people.html", live=live, as_of=as_of, hours=list(range(s.cfg.open_hour, s.cfg.close_hour + 1)),
                      today_plan=today_plan, delta_hours=delta_hours, stations=STATIONS,
                      heat=charts.staffing_heat(today_plan, STATIONS, "Today: people needed by hour and station"),
                      live_chart=charts.hourly_chart(s.day(s.today), "Today: forecast, actual, and live revision", revised=live["table"]["revised"]),
                      summary=s.summary, cards=cards, lineup=s.lineup(), hiring=s.hiring_needs(),
                      overstaff=s.overstaff_warnings(), understaff=s.understaff_warnings(),
                      decisions=app.state.db.decisions(10), week_totals=plan.groupby("date")[["total", "baseline_total"]].sum().reset_index())

    @app.post("/people/decision")
    def decision(request: Request, csrf_token_field: str = Form(alias="csrf_token"), as_of: int = Form(...), outcome: str = Form(...), note: str = Form("")):
        session = require_role(request, "shift_lead")
        check_csrf(session, csrf_token_field)
        if outcome not in ("followed", "overrode", "hold"):
            return redirect("/people", "Unknown outcome.")
        live = state.live(as_of_hour=int(as_of))
        app.state.db.record_decision(session["u"], state.today.strftime("%Y-%m-%d"), int(as_of), live["signal"], float(live["ratio"]), outcome, note.strip()[:300])
        app.state.db.audit(session["u"], "decision", {"signal": live["signal"], "ratio": round(live["ratio"], 3), "outcome": outcome, "as_of": int(as_of)})
        return redirect(f"/people?as_of={int(as_of)}", "Decision logged.")

    @app.get("/ordering", response_class=HTMLResponse)
    def ordering_page(request: Request, template: str | None = None):
        require_role(request, "viewer")
        s, db = state, app.state.db
        inv = db.inventory()
        on_hand = {k: v["on_hand"] for k, v in inv.items()}
        on_order = {k: v["on_order"] for k, v in inv.items()}
        orders = s.orders(on_hand, on_order)
        overrides = db.overrides()
        orders["final_cases"] = [overrides.get(r.ingredient, r.order_cases) for r in orders.itertuples()]
        orders["overridden"] = [r.ingredient in overrides for r in orders.itertuples()]
        orders["final_cost"] = [round(c * ordering.INGREDIENTS[i].case_size * ordering.INGREDIENTS[i].unit_cost, 2) for i, c in zip(orders["ingredient"], orders["final_cases"], strict=True)]
        tpls = db.templates()
        sel = template if template in tpls else "distributor_order_guide"
        usage = s.usage()
        usage_pivot = usage.pivot(index="ingredient", columns="date", values="qty").round(0)
        return render(request, "ordering.html", orders=orders, inventory=inv, ingredients=ordering.INGREDIENTS, templates=tpls, sel=sel,
                      spec_json=json.dumps(tpls[sel], indent=2), elig=s.auto_order_eligibility(), unlocks=db.auto_unlocks(),
                      usage_pivot=usage_pivot, usage_dates=[pd.Timestamp(c) for c in usage_pivot.columns],
                      delivery=(s.today + timedelta(days=2)).date(), total_cost=float(orders["final_cost"].sum()))

    @app.post("/ordering/inventory")
    async def set_inventory(request: Request):
        session = require_role(request, "shift_lead")
        form = await request.form()
        check_csrf(session, form.get("csrf_token"))
        n = 0
        for ing in ordering.INGREDIENTS:
            raw = form.get(f"on_hand_{ing}")
            if raw is None or raw == "":
                continue
            try:
                oh = max(float(raw), 0.0)
                oo = max(float(form.get(f"on_order_{ing}") or 0), 0.0)
            except ValueError:
                continue
            app.state.db.set_inventory(ing, oh, oo, session["u"])
            n += 1
        app.state.db.audit(session["u"], "inventory_counts", {"items": n})
        return redirect("/ordering", f"Saved {n} counts.")

    @app.post("/ordering/override")
    def set_override(request: Request, csrf_token_field: str = Form(alias="csrf_token"), ingredient: str = Form(...), cases: str = Form("")):
        session = require_role(request, "gm")
        check_csrf(session, csrf_token_field)
        if ingredient not in ordering.INGREDIENTS:
            return redirect("/ordering", "Unknown ingredient.")
        if cases.strip() == "":
            app.state.db.set_override(ingredient, None, session["u"])
            app.state.db.audit(session["u"], "order_override_cleared", {"ingredient": ingredient})
            return redirect("/ordering", f"Override cleared for {ingredient}.")
        try:
            c = max(int(cases), 0)
        except ValueError:
            return redirect("/ordering", "Cases must be a whole number.")
        app.state.db.set_override(ingredient, c, session["u"])
        app.state.db.audit(session["u"], "order_override", {"ingredient": ingredient, "cases": c})
        return redirect("/ordering", f"{ingredient} set to {c} cases.")

    @app.post("/ordering/unlock")
    def set_unlock(request: Request, csrf_token_field: str = Form(alias="csrf_token"), ingredient: str = Form(...), enabled: str = Form("0")):
        session = require_role(request, "gm")
        check_csrf(session, csrf_token_field)
        if ingredient not in ordering.INGREDIENTS:
            return redirect("/ordering", "Unknown ingredient.")
        want = enabled == "1"
        if want and not state.auto_order_eligibility()["eligible"]:
            return redirect("/ordering", "Auto-order is locked until the forecast has met the accuracy bar for 4 straight weeks.")
        app.state.db.set_auto_unlock(ingredient, want, session["u"])
        app.state.db.audit(session["u"], "auto_order_toggle", {"ingredient": ingredient, "enabled": want})
        return redirect("/ordering", f"Auto-order {'enabled' if want else 'disabled'} for {ingredient}.")

    @app.post("/ordering/template")
    def save_template(request: Request, csrf_token_field: str = Form(alias="csrf_token"), spec: str = Form(...)):
        session = require_role(request, "gm")
        check_csrf(session, csrf_token_field)
        if len(spec) > 20000:
            return redirect("/ordering", "Template too large.")
        try:
            parsed = json.loads(spec)
        except json.JSONDecodeError as exc:
            return redirect("/ordering", f"Template is not valid JSON: {exc.msg}.")
        errors = exports.validate_template(parsed)
        if errors:
            return redirect("/ordering", "Template rejected: " + "; ".join(errors))
        name = parsed["name"].strip()[:60]
        parsed["name"] = name
        app.state.db.save_template(name, parsed, session["u"])
        app.state.db.audit(session["u"], "template_saved", {"name": name})
        return redirect(f"/ordering?template={name}", f"Template '{name}' saved.")

    @app.get("/ordering/export")
    def export_order(request: Request, template: str = "distributor_order_guide", delivery: str | None = None):
        session = require_role(request, "shift_lead")
        tpls = app.state.db.templates()
        if template not in tpls:
            raise HTTPException(404, "unknown template")
        try:
            dd = date.fromisoformat(delivery) if delivery else (state.today + timedelta(days=2)).date()
        except ValueError:
            raise HTTPException(400, "bad delivery date") from None
        inv = app.state.db.inventory()
        orders = state.orders({k: v["on_hand"] for k, v in inv.items()}, {k: v["on_order"] for k, v in inv.items()})
        overrides = app.state.db.overrides()
        orders["order_cases"] = [overrides.get(r.ingredient, r.order_cases) for r in orders.itertuples()]
        orders["order_units"] = [c * ordering.INGREDIENTS[i].case_size for i, c in zip(orders["ingredient"], orders["order_cases"], strict=True)]
        body = exports.render_order(tpls[template], orders, dd, {k: v.case_size for k, v in ordering.INGREDIENTS.items()})
        app.state.db.audit(session["u"], "order_exported", {"template": template, "delivery": dd.isoformat(), "lines": int((orders["order_cases"] > 0).sum()), "cases": int(orders["order_cases"].sum())})
        ext = "tsv" if tpls[template].get("format") == "tsv" else "csv"
        fname = f"order_{template}_{dd.isoformat()}.{ext}"
        return Response(body, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    @app.get("/assistant", response_class=HTMLResponse)
    def assistant_page(request: Request):
        session = require_role(request, "viewer")
        return render(request, "assistant.html", history=app.state.db.assistant_history(session["u"]), backend=app.state.assistant.name,
                      ollama_url=settings.ollama_url if settings.assistant_backend == "ollama" else None)

    @app.post("/assistant")
    def assistant_ask(request: Request, csrf_token_field: str = Form(alias="csrf_token"), question: str = Form(...)):
        session = require_role(request, "viewer")
        check_csrf(session, csrf_token_field)
        q = question.strip()[:500]
        if not q:
            return redirect("/assistant")
        clean, n = assistant_mod.redact(q)
        ans = app.state.assistant.answer(clean)
        app.state.db.log_assistant(session["u"], ans.backend, clean, ans.text, n + ans.redactions)
        return redirect("/assistant")

    @app.get("/admin", response_class=HTMLResponse)
    def admin(request: Request):
        require_role(request, "admin")
        return render(request, "admin.html", users=app.state.db.list_users(), audit=app.state.db.audit_entries(200), settings=settings)

    @app.post("/admin/users")
    def create_user(request: Request, csrf_token_field: str = Form(alias="csrf_token"), username: str = Form(...), display_name: str = Form(...), role: str = Form(...), password: str = Form(...)):
        session = require_role(request, "admin")
        check_csrf(session, csrf_token_field)
        username = username.strip().lower()[:64]
        if not username.isalnum():
            return redirect("/admin", "Usernames are letters and digits only.")
        if role not in ("admin", "gm", "shift_lead", "viewer"):
            return redirect("/admin", "Unknown role.")
        errs = password_policy_errors(password)
        if errs:
            return redirect("/admin", "Password needs " + ", ".join(errs) + ".")
        if app.state.db.get_user(username):
            return redirect("/admin", "That username exists.")
        app.state.db.create_user(username, hash_password(password), role, display_name.strip()[:80])
        app.state.db.audit(session["u"], "user_created", {"username": username, "role": role})
        return redirect("/admin", f"User {username} created.")

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    return app


def _apply_manual_events(app: FastAPI) -> None:
    rows = app.state.db.manual_events()
    extra = pd.DataFrame([{"start": pd.Timestamp(r["start"]), "end": pd.Timestamp(r["end"]), "name": r["name"], "attendance": r["attendance"],
                           "distance_mi": r["distance_mi"], "category": r["category"]} for r in rows]) if rows else None
    app.state.store.apply_events(extra)


def _bootstrap_admin(app: FastAPI) -> None:
    db, settings = app.state.db, app.state.settings
    if db.user_count():
        return
    pw = settings.bootstrap_password or secrets.token_urlsafe(14)
    db.create_user(settings.bootstrap_admin, hash_password(pw), "admin", "Administrator")
    db.audit("system", "bootstrap_admin", {"username": settings.bootstrap_admin})
    if settings.bootstrap_password:
        log.warning("Created admin user '%s' from FLOWCAST_ADMIN_PASSWORD.", settings.bootstrap_admin)
    else:
        # Printed once, never stored. Change it after first login.
        print(f"\n*** First run: admin user '{settings.bootstrap_admin}' created with password: {pw}\n", flush=True)


app = None  # created lazily by `flowcast serve` or tests
