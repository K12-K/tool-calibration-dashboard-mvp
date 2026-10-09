from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "dev-only-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"  # set to "production" on the client server
    database_url: str = "postgresql+psycopg://calibration:calibration@localhost:5432/calibration"
    secret_key: str = DEFAULT_SECRET
    access_token_expire_minutes: int = 480

    upload_dir: str = "./uploads"
    max_upload_bytes: int = 3 * 1024 * 1024  # 3 MB
    max_images: int = 5
    max_certificates: int = 3

    cors_origins: str = ""  # comma separated; not needed when served behind the bundled nginx
    allow_registration: bool = True
    registration_allowed_email_domains: str = ""  # e.g. "acme.com,acme.co.in"; empty = any

    totp_issuer: str = "Calibration Log"
    max_failed_attempts: int = 5
    lockout_minutes: int = 15

    due_soon_days: int = 10
    enable_docs: bool | None = None  # default: on in development, off in production

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir).resolve()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_domains(self) -> list[str]:
        return [d.strip().lower() for d in self.registration_allowed_email_domains.split(",") if d.strip()]

    @property
    def docs_enabled(self) -> bool:
        if self.enable_docs is not None:
            return self.enable_docs
        return self.environment != "production"

    def validate_for_production(self) -> None:
        if self.environment == "production" and (
            self.secret_key == DEFAULT_SECRET
            or len(self.secret_key) < 32
            or self.secret_key.lower().startswith("change")
        ):
            raise RuntimeError(
                "SECRET_KEY must be set to a random string of at least 32 characters "
                "when ENVIRONMENT=production (generate one with: openssl rand -hex 32)."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
