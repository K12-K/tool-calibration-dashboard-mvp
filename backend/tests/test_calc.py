import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.calc import add_months, calc_days_left, calc_display_status, calc_due_date  # noqa: E402


def test_add_months():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2026, 3, 15), 12) == date(2027, 3, 15)
    assert add_months(date(2026, 11, 30), 3) == date(2027, 2, 28)


def test_due_and_days_left():
    assert calc_due_date(None, 12) is None
    assert calc_due_date(date(2026, 1, 1), None) is None
    due = calc_due_date(date(2026, 1, 1), 6)
    assert due == date(2026, 7, 1)
    assert calc_days_left(due, today=date(2026, 6, 21)) == 10
    assert calc_days_left(due, today=date(2026, 7, 2)) == -1


def test_display_status():
    d = date(2026, 1, 1)
    today = date(2026, 2, 1)
    assert calc_display_status("CALIBRATED", d, today) == "PAST DUE"
    assert calc_display_status("OUT FOR CALIBRATION", d, today) == "OUT FOR CALIBRATION"
    assert calc_display_status("CALIBRATED", None, today) == "CALIBRATED"


if __name__ == "__main__":
    test_add_months()
    test_due_and_days_left()
    test_display_status()
    print("ok")
