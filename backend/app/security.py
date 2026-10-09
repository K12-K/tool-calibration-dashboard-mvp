import base64
import hmac
import io
import time
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
import qrcode
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from .config import settings

_ph = PasswordHasher()
_DUMMY_HASH = _ph.hash("dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def burn_password_check() -> None:
    """Equalise response time when the account does not exist."""
    verify_password("x", _DUMMY_HASH)


# ---- JWT
def create_access_token(user_id: int, token_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "ver": token_version,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# ---- TOTP (authenticator apps: Google/Microsoft Authenticator, Authy, 1Password ...)
def new_totp_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.totp_issuer)


def qr_data_uri(text: str) -> str:
    img = qrcode.make(text, box_size=7, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def verify_totp(secret: str, code: str, last_step: int | None) -> int | None:
    """Return the matched time-step (so it can be stored and never reused), or None.
    Accepts the previous, current and next 30-second window to tolerate clock drift."""
    totp = pyotp.TOTP(secret)
    current = int(time.time()) // 30
    matched: int | None = None
    for step in (current - 1, current, current + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(totp.at(step * 30), code) and matched is None:
            matched = step
    return matched
