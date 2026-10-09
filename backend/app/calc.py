"""Pure date helpers (no third-party imports, easy to unit test)."""
import calendar
from datetime import date


def add_months(d: date, months: int) -> date:
    idx = d.month - 1 + months
    year = d.year + idx // 12
    month = idx % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def calc_due_date(calibration_date: date | None, frequency_months: int | None) -> date | None:
    if calibration_date is None or frequency_months is None:
        return None
    return add_months(calibration_date, frequency_months)


def calc_days_left(due_date: date | None, today: date | None = None) -> int | None:
    if due_date is None:
        return None
    return (due_date - (today or date.today())).days


def calc_display_status(status: str, due_date: date | None, today: date | None = None) -> str:
    """A CALIBRATED gauge whose due date has passed is shown as PAST DUE."""
    if status == "CALIBRATED" and due_date is not None and due_date < (today or date.today()):
        return "PAST DUE"
    return status
