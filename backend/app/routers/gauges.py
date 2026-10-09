import json
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Integer, case, cast, false, func, literal_column, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..calc import calc_due_date
from ..constants import STATUS_CALIBRATED, STATUS_PAST_DUE
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..files import delete_file
from ..models import Gauge, User
from ..schemas import ColumnValues, GaugeDetail, GaugeIn, GaugeList, GaugeOut

router = APIRouter(prefix="/api/gauges", tags=["gauges"], dependencies=[Depends(get_current_user)])

BLANK = "__BLANK__"

# Computed in SQL so that filtering / sorting works on them exactly like on stored columns.
DAYS_LEFT = cast(Gauge.due_date - func.current_date(), Integer)
# Inline literals (trusted constants) rather than bind parameters, so the SQL text of this
# expression is identical wherever it is used (SELECT / WHERE / ORDER BY).
DISPLAY_STATUS = case(
    (
        (Gauge.status == literal_column(f"'{STATUS_CALIBRATED}'"))
        & Gauge.due_date.is_not(None)
        & (Gauge.due_date < func.current_date()),
        literal_column(f"'{STATUS_PAST_DUE}'"),
    ),
    else_=Gauge.status,
)

COLUMNS: dict[str, tuple] = {
    "asset_no": (Gauge.asset_no, "text"),
    "description": (Gauge.description, "text"),
    "manufacturer": (Gauge.manufacturer, "text"),
    "serial_number": (Gauge.serial_number, "text"),
    "gauge_code": (Gauge.gauge_code, "text"),
    "calibration_date": (Gauge.calibration_date, "date"),
    "frequency_months": (Gauge.frequency_months, "int"),
    "due_date": (Gauge.due_date, "date"),
    "days_left": (DAYS_LEFT, "int"),
    "status": (DISPLAY_STATUS, "text"),
    "location": (Gauge.location, "text"),
    "comments": (Gauge.comments, "text"),
    "created_at": (Gauge.created_at, "datetime"),
}
SEARCH_COLUMNS = ["asset_no", "description", "manufacturer", "serial_number", "gauge_code", "location", "comments"]


def _convert(kind: str, value: str):
    try:
        if kind == "int":
            return int(value)
        if kind == "date":
            return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid filter value: {value!r}")
    return value


def _parse_json_param(raw: str | None, name: str) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name} must be valid JSON")
    if not isinstance(data, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name} must be an object")
    return data


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def build_conditions(q: str | None, filters: dict, contains: dict) -> list:
    conds = []
    if q and q.strip():
        pattern = f"%{_escape_like(q.strip())}%"
        conds.append(or_(*[COLUMNS[c][0].ilike(pattern, escape="\\") for c in SEARCH_COLUMNS]))
    for key, values in filters.items():
        if key not in COLUMNS or key == "created_at" or not isinstance(values, list) or not values:
            continue
        col, kind = COLUMNS[key]
        values = [str(v) for v in values]
        parts = []
        real = [_convert(kind, v) for v in values if v != BLANK]
        if real:
            parts.append(col.in_(real))
        if BLANK in values:
            parts.append(col.is_(None))
            if kind == "text":
                parts.append(col == "")
        conds.append(or_(*parts) if parts else false())
    for key, text in contains.items():
        if key in COLUMNS and COLUMNS[key][1] == "text" and isinstance(text, str) and text.strip():
            conds.append(COLUMNS[key][0].ilike(f"%{_escape_like(text.strip())}%", escape="\\"))
    return conds


@router.get("", response_model=GaugeList)
def list_gauges(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    sort_by: str = "created_at",
    sort_dir: Literal["asc", "desc"] = "desc",
    q: str | None = None,
    filters: str | None = Query(None, description='JSON: {"status": ["CALIBRATED"], "location": ["QC", "__BLANK__"]}'),
    contains: str | None = Query(None, description='JSON: {"comments": "text"}'),
):
    if sort_by not in COLUMNS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown sort column")
    conds = build_conditions(q, _parse_json_param(filters, "filters"), _parse_json_param(contains, "contains"))

    col, kind = COLUMNS[sort_by]
    sort_expr = func.lower(col) if kind == "text" else col
    order = sort_expr.asc().nulls_last() if sort_dir == "asc" else sort_expr.desc().nulls_last()

    total = db.scalar(select(func.count()).select_from(Gauge).where(*conds)) or 0
    items = db.scalars(
        select(Gauge).where(*conds).order_by(order, Gauge.id.desc()).limit(page_size).offset((page - 1) * page_size)
    ).all()
    return GaugeList(items=[GaugeOut.model_validate(g) for g in items], total=total, page=page, page_size=page_size)


@router.get("/columns/{column}/values", response_model=ColumnValues)
def column_values(column: str, db: Session = Depends(get_db)):
    """Distinct values of a column - powers the Excel-style filter checklist."""
    if column not in COLUMNS or column == "created_at":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown column")
    col, kind = COLUMNS[column]
    limit = 500
    rows = db.execute(select(col).where(col.is_not(None)).distinct().limit(limit + 1)).scalars().all()
    rows = [r for r in rows if r != ""]
    truncated = len(rows) > limit
    rows = rows[:limit]
    if kind == "text":
        rows.sort(key=lambda s: s.lower())
    else:
        rows.sort()
    blank_cond = col.is_(None) | (col == "") if kind == "text" else col.is_(None)
    has_blank = (db.scalar(select(func.count()).select_from(Gauge).where(blank_cond)) or 0) > 0
    return ColumnValues(values=[str(r) for r in rows], has_blank=has_blank, truncated=truncated)


def _get_or_404(db: Session, gauge_id: int) -> Gauge:
    g = db.scalar(select(Gauge).where(Gauge.id == gauge_id).options(selectinload(Gauge.attachments)))
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gauge not found")
    return g


def _ensure_unique_asset(db: Session, asset_no: str, exclude_id: int | None = None) -> None:
    stmt = select(Gauge.id).where(func.lower(Gauge.asset_no) == asset_no.lower())
    if exclude_id is not None:
        stmt = stmt.where(Gauge.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Asset # already exists")


@router.get("/{gauge_id}", response_model=GaugeDetail)
def get_gauge(gauge_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, gauge_id)


@router.post("", response_model=GaugeDetail, status_code=status.HTTP_201_CREATED)
def create_gauge(payload: GaugeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_unique_asset(db, payload.asset_no)
    g = Gauge(**payload.model_dump(), created_by_id=user.id, updated_by_id=user.id)
    g.due_date = calc_due_date(g.calibration_date, g.frequency_months)
    db.add(g)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Asset # already exists")
    return _get_or_404(db, g.id)


@router.put("/{gauge_id}", response_model=GaugeDetail)
def update_gauge(gauge_id: int, payload: GaugeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = _get_or_404(db, gauge_id)
    _ensure_unique_asset(db, payload.asset_no, exclude_id=gauge_id)
    for key, value in payload.model_dump().items():
        setattr(g, key, value)
    g.due_date = calc_due_date(g.calibration_date, g.frequency_months)
    g.updated_by_id = user.id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Asset # already exists")
    db.expire_all()
    return _get_or_404(db, gauge_id)


@router.delete("/{gauge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gauge(gauge_id: int, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    g = _get_or_404(db, gauge_id)
    stored = [a.stored_name for a in g.attachments]
    db.delete(g)
    db.commit()
    for name in stored:
        delete_file(name)
