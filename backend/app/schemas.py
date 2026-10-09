import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .constants import LOCATIONS, STATUSES

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._/\-]*$")  # "alpha numeric" (+ common separators)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_DATE = date(2000, 1, 1)
MAX_DATE = date(2100, 12, 31)


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


# ---------------------------------------------------------------- gauges
class GaugeIn(BaseModel):
    asset_no: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    manufacturer: str | None = Field(default=None, max_length=200)
    serial_number: str | None = Field(default=None, max_length=100)
    gauge_code: str | None = Field(default=None, max_length=100)
    calibration_date: date | None = None
    frequency_months: int | None = Field(default=None, ge=1, le=240)
    status: str = "CALIBRATED"
    location: str | None = None
    comments: str | None = Field(default=None, max_length=5000)

    @field_validator("asset_no", mode="before")
    @classmethod
    def _strip_asset(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("description", "manufacturer", "serial_number", "gauge_code", "location", "comments", mode="before")
    @classmethod
    def _blanks(cls, v):
        return _blank_to_none(v)

    @field_validator("asset_no")
    @classmethod
    def _asset_ok(cls, v: str) -> str:
        if not ID_RE.match(v):
            raise ValueError("Asset # may contain only letters, numbers, spaces and . _ / -")
        return v

    @field_validator("serial_number")
    @classmethod
    def _sn_ok(cls, v: str | None) -> str | None:
        if v is not None and not ID_RE.match(v):
            raise ValueError("S/N may contain only letters, numbers, spaces and . _ / -")
        return v

    @field_validator("status")
    @classmethod
    def _status_ok(cls, v: str) -> str:
        if v not in STATUSES:
            raise ValueError("Invalid status")
        return v

    @field_validator("location")
    @classmethod
    def _location_ok(cls, v: str | None) -> str | None:
        if v is not None and v not in LOCATIONS:
            raise ValueError("Invalid location")
        return v

    @field_validator("calibration_date")
    @classmethod
    def _date_ok(cls, v: date | None) -> date | None:
        if v is not None and not (MIN_DATE <= v <= MAX_DATE):
            raise ValueError("Date is out of range")
        return v


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    original_name: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime


class GaugeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_no: str
    description: str | None
    manufacturer: str | None
    serial_number: str | None
    gauge_code: str | None
    calibration_date: date | None
    frequency_months: int | None
    due_date: date | None
    days_left: int | None
    status: str  # what the user selected
    display_status: str  # what the table shows (CALIBRATED + overdue => PAST DUE)
    location: str | None
    comments: str | None
    created_at: datetime
    updated_at: datetime


class GaugeDetail(GaugeOut):
    attachments: list[AttachmentOut] = []


class GaugeList(BaseModel):
    items: list[GaugeOut]
    total: int
    page: int
    page_size: int


class ColumnValues(BaseModel):
    values: list[str]
    has_blank: bool
    truncated: bool


# ---------------------------------------------------------------- reports
class ReportSummary(BaseModel):
    total: int
    due_soon: int
    past_due: int
    by_status: dict[str, int]


class CalibrationReport(BaseModel):
    generated_on: date
    window_days: int
    summary: ReportSummary
    due_soon: list[GaugeOut]
    past_due: list[GaugeOut]


# ---------------------------------------------------------------- meta
class Limits(BaseModel):
    max_images: int
    max_certificates: int
    max_upload_bytes: int


class OptionsOut(BaseModel):
    statuses: list[str]
    locations: list[str]
    limits: Limits
    due_soon_days: int


# ---------------------------------------------------------------- auth
class _EmailMixin(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _email_ok(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) > 254 or not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address")
        return v


def _check_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v) > 128:
        raise ValueError("Password is too long")
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


class RegisterIn(_EmailMixin):
    password: str
    full_name: str = Field(default="", max_length=200)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        return v.strip()


class RegisterOut(BaseModel):
    email: str
    secret: str
    otpauth_uri: str
    qr_png_data_uri: str


class VerifyIn(_EmailMixin):
    code: str = Field(pattern=r"^\d{6}$")


class LoginIn(_EmailMixin):
    password: str = Field(min_length=1, max_length=128)


class ResetIn(_EmailMixin):
    code: str = Field(pattern=r"^\d{6}$")
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    role: Literal["admin", "user"]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class Message(BaseModel):
    message: str
