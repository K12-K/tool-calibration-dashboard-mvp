from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import LoginIn, Message, RegisterIn, RegisterOut, ResetIn, TokenOut, UserOut, VerifyIn
from ..security import (
    burn_password_check,
    create_access_token,
    hash_password,
    new_totp_secret,
    provisioning_uri,
    qr_data_uri,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def _check_locked(user: User) -> None:
    if user.locked_until and user.locked_until > _now():
        minutes = max(1, int((user.locked_until - _now()).total_seconds() // 60) + 1)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Too many failed attempts. Try again in {minutes} minute(s).")


def _register_failure(db: Session, user: User) -> None:
    user.failed_attempts = (user.failed_attempts or 0) + 1
    if user.failed_attempts >= settings.max_failed_attempts:
        user.locked_until = _now() + timedelta(minutes=settings.lockout_minutes)
        user.failed_attempts = 0
    db.commit()


def _clear_failures(user: User) -> None:
    user.failed_attempts = 0
    user.locked_until = None


# ------------------------------------------------------------ registration (step 1)
@router.post("/register", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    """Create the account and return the TOTP secret/QR code. The account only becomes
    usable after /register/verify proves the authenticator app was set up."""
    if not settings.allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is disabled. Contact your administrator.")
    domains = settings.allowed_domains
    if domains and payload.email.rsplit("@", 1)[1] not in domains:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is restricted to approved company email domains.")

    user = _get_user(db, payload.email)
    if user is not None and user.totp_confirmed:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    secret = new_totp_secret()
    if user is None:
        user = User(email=payload.email)
        db.add(user)
    user.full_name = payload.full_name
    user.password_hash = hash_password(payload.password)
    user.totp_secret = secret
    user.totp_confirmed = False
    user.last_totp_step = None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    uri = provisioning_uri(secret, payload.email)
    return RegisterOut(email=payload.email, secret=secret, otpauth_uri=uri, qr_png_data_uri=qr_data_uri(uri))


# ------------------------------------------------------------ registration (step 2)
@router.post("/register/verify", response_model=Message)
def verify_registration(payload: VerifyIn, db: Session = Depends(get_db)):
    user = _get_user(db, payload.email)
    bad = HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid code. Check your authenticator app and try again.")
    if user is None or user.totp_confirmed:
        raise bad
    _check_locked(user)
    step = verify_totp(user.totp_secret, payload.code, user.last_totp_step)
    if step is None:
        _register_failure(db, user)
        raise bad
    user.totp_confirmed = True
    user.last_totp_step = step
    _clear_failures(user)
    # The first confirmed account becomes the administrator.
    has_admin = db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.totp_confirmed.is_(True)))
    user.role = "user" if has_admin else "admin"
    db.commit()
    return Message(message="Two-factor authentication enabled. You can now sign in.")


# ------------------------------------------------------------ login
@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    user = _get_user(db, payload.email)
    if user is None:
        burn_password_check()
        raise invalid
    _check_locked(user)
    if not verify_password(payload.password, user.password_hash):
        _register_failure(db, user)
        raise invalid
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled.")
    if not user.totp_confirmed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Authenticator setup was not completed. Register again with the same email to get a new QR code.",
        )
    _clear_failures(user)
    db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.token_version), user=UserOut.model_validate(user))


# ------------------------------------------------------------ password reset via authenticator app
@router.post("/reset-password", response_model=Message)
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    invalid = HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid email or authenticator code.")
    user = _get_user(db, payload.email)
    if user is None or not user.totp_confirmed or not user.is_active:
        burn_password_check()
        raise invalid
    _check_locked(user)
    step = verify_totp(user.totp_secret, payload.code, user.last_totp_step)
    if step is None:
        _register_failure(db, user)
        raise invalid
    user.password_hash = hash_password(payload.new_password)
    user.last_totp_step = step
    user.token_version += 1  # signs out every existing session
    _clear_failures(user)
    db.commit()
    return Message(message="Password updated. You can now sign in.")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
