from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..calc import add_months
from ..constants import MAX_USAGE_RANGE_MONTHS
from ..database import get_db
from ..deps import get_current_user
from ..models import Gauge, UsageLog, User
from ..schemas import GaugeOption, UsageLogIn, UsageLogList, UsageLogOut

router = APIRouter(prefix="/api/usage-logs", tags=["usage-logs"], dependencies=[Depends(get_current_user)])


@router.get("/gauges", response_model=list[GaugeOption])
def gauge_options(db: Session = Depends(get_db)):
    """Gauges that can be picked when adding a log."""
    rows = db.execute(select(Gauge.id, Gauge.asset_no, Gauge.description).order_by(func.lower(Gauge.asset_no))).all()
    return [GaugeOption(id=r.id, asset_no=r.asset_no, description=r.description) for r in rows]


@router.get("", response_model=UsageLogList)
def list_usage_logs(
    date_from: date,
    date_to: date,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Logs whose start time falls inside [date_from, date_to] (server local time), newest first."""
    if date_to < date_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "End date cannot be before the start date.")
    if date_to > add_months(date_from, MAX_USAGE_RANGE_MONTHS):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The period cannot be longer than {MAX_USAGE_RANGE_MONTHS} months.")

    start = datetime.combine(date_from, time.min).astimezone()
    end = datetime.combine(date_to + timedelta(days=1), time.min).astimezone()
    conds = [UsageLog.start_time >= start, UsageLog.start_time < end]

    total = db.scalar(select(func.count()).select_from(UsageLog).where(*conds)) or 0
    items = db.scalars(
        select(UsageLog)
        .where(*conds)
        .options(selectinload(UsageLog.gauge))
        .order_by(UsageLog.start_time.desc(), UsageLog.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return UsageLogList(items=[UsageLogOut.model_validate(i) for i in items], total=total, page=page, page_size=page_size)


@router.post("", response_model=UsageLogOut, status_code=status.HTTP_201_CREATED)
def create_usage_log(payload: UsageLogIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    gauge = db.get(Gauge, payload.gauge_id)
    if gauge is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gauge not found")
    log = UsageLog(
        employee_id=payload.employee_id,
        gauge_id=gauge.id,
        asset_no=gauge.asset_no,
        start_time=payload.start_time,
        end_time=payload.end_time,
        created_by_id=user.id,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return UsageLogOut.model_validate(log)
