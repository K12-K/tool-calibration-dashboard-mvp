from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..calc import calc_display_status
from ..constants import EXCLUDED_FROM_REPORTS
from ..database import get_db
from ..deps import get_current_user
from ..models import Gauge
from ..schemas import CalibrationReport, GaugeOut, ReportSummary

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(get_current_user)])


@router.get("/calibration", response_model=CalibrationReport)
def calibration_report(days: int = Query(10, ge=1, le=365), db: Session = Depends(get_db)):
    today = date.today()
    horizon = today + timedelta(days=days)
    in_scope = Gauge.status.not_in(EXCLUDED_FROM_REPORTS) & Gauge.due_date.is_not(None)

    due_soon = db.scalars(
        select(Gauge).where(in_scope, Gauge.due_date >= today, Gauge.due_date <= horizon).order_by(Gauge.due_date.asc(), Gauge.asset_no)
    ).all()
    past_due = db.scalars(
        select(Gauge).where(in_scope, Gauge.due_date < today).order_by(Gauge.due_date.asc(), Gauge.asset_no)
    ).all()

    by_status: dict[str, int] = {}
    for status_value, due in db.execute(select(Gauge.status, Gauge.due_date)).all():
        key = calc_display_status(status_value, due, today)
        by_status[key] = by_status.get(key, 0) + 1

    return CalibrationReport(
        generated_on=today,
        window_days=days,
        summary=ReportSummary(
            total=sum(by_status.values()), due_soon=len(due_soon), past_due=len(past_due), by_status=by_status
        ),
        due_soon=[GaugeOut.model_validate(g) for g in due_soon],
        past_due=[GaugeOut.model_validate(g) for g in past_due],
    )
