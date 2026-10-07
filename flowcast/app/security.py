"""Authentication, sessions, CSRF, throttling, and response hardening.

- Passwords: scrypt (stdlib), per-user random salt, constant-time compare.
- Sessions: signed, time-limited cookie (HttpOnly, SameSite=Strict, Secure in
  production). The cookie carries only the username and role; nothing else.
- CSRF: a per-session token embedded in every form and checked on every POST.
- Login throttling: lockout after N failures in a window, per username.
- Headers: strict Content-Security-Policy (self only, no inline scripts),
  no framing, no sniffing, no referrer leakage, HSTS when TLS is on.
- Roles: admin > gm > shift_lead > viewer. Routes declare the minimum role.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from starlette.middleware.base import BaseHTTPMiddleware

ROLE_RANK = {"viewer": 0, "shift_lead": 1, "gm": 2, "admin": 3}
SESSION_COOKIE = "flowcast_session"

_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **_SCRYPT)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def password_policy_errors(password: str) -> list[str]:
    errors = []
    if len(password) < 12:
        errors.append("at least 12 characters")
    if password.lower() == password or password.upper() == password:
        errors.append("mixed case")
    if not any(ch.isdigit() for ch in password):
        errors.append("a digit")
    return errors


class SessionManager:
    def __init__(self, secret_key: str, max_age: int, secure: bool):
        self._serializer = URLSafeTimedSerializer(secret_key, salt="flowcast.session")
        self.max_age = max_age
        self.secure = secure

    def issue(self, username: str, role: str) -> str:
        return self._serializer.dumps({"u": username, "r": role, "c": secrets.token_urlsafe(24)})

    def read(self, token: str | None) -> dict | None:
        if not token:
            return None
        try:
            data = self._serializer.loads(token, max_age=self.max_age)
        except (BadSignature, SignatureExpired):
            return None
        if not isinstance(data, dict) or {"u", "r", "c"} - set(data):
            return None
        return data

    def set_cookie(self, response, token: str) -> None:
        response.set_cookie(
            SESSION_COOKIE,
            token,
            max_age=self.max_age,
            httponly=True,
            secure=self.secure,
            samesite="strict",
            path="/",
        )

    def clear_cookie(self, response) -> None:
        response.delete_cookie(SESSION_COOKIE, path="/")


def current_session(request: Request) -> dict | None:
    return request.app.state.sessions.read(request.cookies.get(SESSION_COOKIE))


def require_role(request: Request, minimum: str) -> dict:
    session = current_session(request)
    if session is None:
        raise HTTPException(status_code=401, detail="login required")
    if ROLE_RANK.get(session["r"], -1) < ROLE_RANK[minimum]:
        raise HTTPException(status_code=403, detail="insufficient role")
    return session


def csrf_token(session: dict) -> str:
    # Derived from the session's random component, so it rotates per login and
    # never has to be stored server-side.
    return hashlib.sha256(("csrf:" + session["c"]).encode()).hexdigest()


def check_csrf(session: dict, submitted: str | None) -> None:
    if not submitted or not hmac.compare_digest(csrf_token(session), submitted):
        raise HTTPException(status_code=403, detail="bad csrf token")


class LoginThrottle:
    def __init__(self, db, max_attempts: int, lockout_seconds: int):
        self.db = db
        self.max_attempts = max_attempts
        self.lockout = lockout_seconds

    def locked(self, username: str) -> bool:
        since = (datetime.now(UTC) - timedelta(seconds=self.lockout)).isoformat(timespec="seconds")
        return self.db.recent_failures(username, since) >= self.max_attempts


CSP = (
    "default-src 'none'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'; "
    "object-src 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, hsts: bool):
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        if self.hsts:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
