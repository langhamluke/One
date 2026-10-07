"""Runtime configuration from environment variables. Nothing secret is in code."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    secret_key: str = field(default_factory=lambda: os.environ.get("FLOWCAST_SECRET_KEY") or "")
    db_path: Path = field(default_factory=lambda: Path(os.environ.get("FLOWCAST_DB", "data/flowcast.db")))
    data_dir: Path | None = field(
        default_factory=lambda: Path(os.environ["FLOWCAST_DATA_DIR"]) if os.environ.get("FLOWCAST_DATA_DIR") else None
    )
    # Cookie `Secure` flag. True in production behind TLS; off only for local dev over http.
    secure_cookies: bool = field(default_factory=lambda: os.environ.get("FLOWCAST_INSECURE_DEV") != "1")
    session_max_age: int = 8 * 3600  # shift-length sessions
    login_max_attempts: int = 5
    login_lockout_seconds: int = 300
    # Assistant: "local" (deterministic, no model) or "ollama" (self-hosted LLM on the operator's hardware).
    assistant_backend: str = field(default_factory=lambda: os.environ.get("FLOWCAST_ASSISTANT", "local"))
    ollama_url: str = field(default_factory=lambda: os.environ.get("FLOWCAST_OLLAMA_URL", "http://127.0.0.1:11434"))
    ollama_model: str = field(default_factory=lambda: os.environ.get("FLOWCAST_OLLAMA_MODEL", "llama3.1:8b"))
    store_name: str = field(default_factory=lambda: os.environ.get("FLOWCAST_STORE_NAME", "Longmont, CO"))
    store_lat: float = field(default_factory=lambda: float(os.environ.get("FLOWCAST_STORE_LAT", "40.1672")))
    store_lon: float = field(default_factory=lambda: float(os.environ.get("FLOWCAST_STORE_LON", "-105.1019")))
    store_tz: str = field(default_factory=lambda: os.environ.get("FLOWCAST_STORE_TZ", "America/Denver"))
    store_state: str = field(default_factory=lambda: os.environ.get("FLOWCAST_STORE_STATE", "CO"))
    wage: float = field(default_factory=lambda: float(os.environ.get("FLOWCAST_WAGE", "16.50")))
    # First-run admin bootstrap. Password is printed once if generated.
    bootstrap_admin: str = field(default_factory=lambda: os.environ.get("FLOWCAST_ADMIN_USER", "admin"))
    bootstrap_password: str | None = field(default_factory=lambda: os.environ.get("FLOWCAST_ADMIN_PASSWORD"))

    def __post_init__(self) -> None:
        if not self.secret_key:
            # Ephemeral key: sessions do not survive a restart. Set FLOWCAST_SECRET_KEY in production.
            self.secret_key = secrets.token_urlsafe(48)
            self.generated_secret = True
        else:
            self.generated_secret = False
        if len(self.secret_key) < 32:
            raise ValueError("FLOWCAST_SECRET_KEY must be at least 32 characters")
