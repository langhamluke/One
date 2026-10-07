"""SQLite persistence for users, audit log, decisions, and operator inputs.

SQLite keeps the deployment to one process and one file on the operator's
own machine. Everything here is plain parameterized SQL; no ORM.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'gm', 'shift_lead', 'viewer')),
    display_name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT NOT NULL,
    at TEXT NOT NULL,
    success INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    username TEXT NOT NULL,
    day TEXT NOT NULL,
    as_of_hour INTEGER NOT NULL,
    signal TEXT NOT NULL,
    ratio REAL NOT NULL,
    outcome TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS inventory_counts (
    ingredient TEXT PRIMARY KEY,
    on_hand REAL NOT NULL,
    on_order REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_overrides (
    ingredient TEXT PRIMARY KEY,
    order_cases INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_templates (
    name TEXT PRIMARY KEY,
    spec TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS manual_events (
    id INTEGER PRIMARY KEY,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    name TEXT NOT NULL,
    attendance INTEGER NOT NULL,
    distance_mi REAL NOT NULL,
    category TEXT NOT NULL,
    created_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assistant_log (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    username TEXT NOT NULL,
    backend TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    redactions INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS auto_order_unlocks (
    ingredient TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Database:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        if str(self.path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(SCHEMA)

    @contextmanager
    def tx(self):
        try:
            yield self._conn
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise

    # ---- users
    def get_user(self, username: str) -> sqlite3.Row | None:
        return self._conn.execute(
            "SELECT * FROM users WHERE username = ? AND active = 1", (username,)
        ).fetchone()

    def create_user(self, username: str, password_hash: str, role: str, display_name: str) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO users (username, password_hash, role, display_name, created_at) VALUES (?,?,?,?,?)",
                (username, password_hash, role, display_name, now_iso()),
            )

    def user_count(self) -> int:
        return int(self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])

    def list_users(self) -> list[sqlite3.Row]:
        return self._conn.execute("SELECT id, username, role, display_name, active, created_at FROM users ORDER BY id").fetchall()

    # ---- login throttling
    def record_login(self, username: str, success: bool) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO login_attempts (username, at, success) VALUES (?,?,?)", (username, now_iso(), int(success)))

    def recent_failures(self, username: str, since_iso: str) -> int:
        return int(
            self._conn.execute(
                "SELECT COUNT(*) FROM login_attempts WHERE username = ? AND success = 0 AND at >= ?",
                (username, since_iso),
            ).fetchone()[0]
        )

    # ---- audit
    def audit(self, username: str, action: str, detail: dict) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO audit_log (at, username, action, detail) VALUES (?,?,?,?)",
                (now_iso(), username, action, json.dumps(detail, default=str)),
            )

    def audit_entries(self, limit: int = 200) -> list[sqlite3.Row]:
        return self._conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()

    # ---- decisions
    def record_decision(self, username: str, day: str, as_of_hour: int, signal: str, ratio: float, outcome: str, note: str) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO decisions (at, username, day, as_of_hour, signal, ratio, outcome, note) VALUES (?,?,?,?,?,?,?,?)",
                (now_iso(), username, day, as_of_hour, signal, ratio, outcome, note),
            )

    def decisions(self, limit: int = 50) -> list[sqlite3.Row]:
        return self._conn.execute("SELECT * FROM decisions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()

    # ---- inventory and orders
    def set_inventory(self, ingredient: str, on_hand: float, on_order: float, username: str) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO inventory_counts (ingredient, on_hand, on_order, updated_at, updated_by) VALUES (?,?,?,?,?) "
                "ON CONFLICT(ingredient) DO UPDATE SET on_hand=excluded.on_hand, on_order=excluded.on_order, "
                "updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                (ingredient, on_hand, on_order, now_iso(), username),
            )

    def inventory(self) -> dict[str, dict]:
        rows = self._conn.execute("SELECT * FROM inventory_counts").fetchall()
        return {r["ingredient"]: dict(r) for r in rows}

    def set_override(self, ingredient: str, cases: int | None, username: str) -> None:
        with self.tx() as c:
            if cases is None:
                c.execute("DELETE FROM order_overrides WHERE ingredient = ?", (ingredient,))
            else:
                c.execute(
                    "INSERT INTO order_overrides (ingredient, order_cases, updated_at, updated_by) VALUES (?,?,?,?) "
                    "ON CONFLICT(ingredient) DO UPDATE SET order_cases=excluded.order_cases, updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                    (ingredient, cases, now_iso(), username),
                )

    def overrides(self) -> dict[str, int]:
        return {r["ingredient"]: int(r["order_cases"]) for r in self._conn.execute("SELECT * FROM order_overrides")}

    def set_auto_unlock(self, ingredient: str, enabled: bool, username: str) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO auto_order_unlocks (ingredient, enabled, updated_at, updated_by) VALUES (?,?,?,?) "
                "ON CONFLICT(ingredient) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                (ingredient, int(enabled), now_iso(), username),
            )

    def auto_unlocks(self) -> dict[str, bool]:
        return {r["ingredient"]: bool(r["enabled"]) for r in self._conn.execute("SELECT * FROM auto_order_unlocks")}

    def save_template(self, name: str, spec: dict, username: str) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO order_templates (name, spec, updated_at, updated_by) VALUES (?,?,?,?) "
                "ON CONFLICT(name) DO UPDATE SET spec=excluded.spec, updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                (name, json.dumps(spec), now_iso(), username),
            )

    def templates(self) -> dict[str, dict]:
        return {r["name"]: json.loads(r["spec"]) for r in self._conn.execute("SELECT * FROM order_templates ORDER BY name")}

    # ---- events
    def add_event(self, start: str, end: str, name: str, attendance: int, distance_mi: float, category: str, username: str) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO manual_events (start, end, name, attendance, distance_mi, category, created_by) VALUES (?,?,?,?,?,?,?)",
                (start, end, name, attendance, distance_mi, category, username),
            )

    def delete_event(self, event_id: int) -> None:
        with self.tx() as c:
            c.execute("DELETE FROM manual_events WHERE id = ?", (event_id,))

    def manual_events(self) -> list[sqlite3.Row]:
        return self._conn.execute("SELECT * FROM manual_events ORDER BY start").fetchall()

    # ---- assistant
    def log_assistant(self, username: str, backend: str, question: str, answer: str, redactions: int) -> None:
        with self.tx() as c:
            c.execute(
                "INSERT INTO assistant_log (at, username, backend, question, answer, redactions) VALUES (?,?,?,?,?,?)",
                (now_iso(), username, backend, question, answer, redactions),
            )

    def assistant_history(self, username: str, limit: int = 20) -> list[sqlite3.Row]:
        rows = self._conn.execute(
            "SELECT * FROM assistant_log WHERE username = ? ORDER BY id DESC LIMIT ?", (username, limit)
        ).fetchall()
        return list(reversed(rows))
