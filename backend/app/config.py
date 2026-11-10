"""Configuration through environment variables (set by portal.yml and the portal)."""
import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # gateway: behind the nicasso gateway (identity from trusted headers).
    # dev: local development, everyone is DEV_USER - never use on a server.
    auth_mode: str = field(default_factory=lambda: _env("AUTH_MODE", "dev").lower())
    gateway_shared_secret: str = field(default_factory=lambda: _env("GATEWAY_SHARED_SECRET"))
    dev_user: str = field(default_factory=lambda: _env("DEV_USER", "dev"))

    # The portal sets DATABASE_URL (postgresql://...) when portal.yml has database: true.
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", "sqlite:///./day.db"))

    public_url: str = field(default_factory=lambda: _env("PUBLIC_URL", "http://localhost:8000").rstrip("/"))
    portal_url: str = field(default_factory=lambda: _env("PORTAL_URL"))
    portal_logout_url: str = field(default_factory=lambda: _env("PORTAL_LOGOUT_URL"))

    # Web Push (portal secret variables). Without keys, push is simply unavailable.
    vapid_public_key: str = field(default_factory=lambda: _env("VAPID_PUBLIC_KEY"))
    vapid_private_key: str = field(default_factory=lambda: _env("VAPID_PRIVATE_KEY"))
    vapid_subject: str = field(default_factory=lambda: _env("VAPID_SUBJECT", "mailto:admin@nicasso.de"))
    # Background scheduler (block notifications); off in tests.
    scheduler_enabled: bool = field(default_factory=lambda: _env("SCHEDULER", "on").lower() != "off")

    # Built React app (frontend/dist); copied to /srv/static in the image.
    static_dir: Path = field(
        default_factory=lambda: Path(_env("STATIC_DIR", str(Path(__file__).resolve().parents[2] / "frontend" / "dist")))
    )

    @property
    def push_enabled(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key)

    def __post_init__(self) -> None:
        if self.auth_mode not in ("gateway", "dev"):
            raise ValueError("AUTH_MODE must be gateway or dev")
        if self.auth_mode == "gateway" and not self.gateway_shared_secret:
            raise ValueError("GATEWAY_SHARED_SECRET is required when AUTH_MODE=gateway")

    @property
    def sqlalchemy_url(self) -> str:
        # psycopg 3 driver for the plain postgresql:// URL the portal provides.
        url = self.database_url
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url


settings = Settings()
