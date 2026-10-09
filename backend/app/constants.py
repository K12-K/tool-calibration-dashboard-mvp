"""Business constants. Edit here to change dropdown values (frontend reads them from the API)."""

STATUSES = [
    "CALIBRATED",
    "PAST DUE",
    "OUT OF SERVICE",
    "REFERENCE ONLY",
    "MISSING/LOST",
    "OUT FOR CALIBRATION",
]

LOCATIONS = [
    "QC",
    "MILL",
    "LATH",
    "WATERJET",
    "LASER",
    "ASSEMBLY",
    "SHIPPING/RECEIVING",
]

# Gauges in these statuses are not expected to be calibrated, so they are left
# out of the "due soon" / "past due" reports.
EXCLUDED_FROM_REPORTS = ["OUT OF SERVICE", "REFERENCE ONLY", "MISSING/LOST"]

STATUS_CALIBRATED = "CALIBRATED"
STATUS_PAST_DUE = "PAST DUE"

KIND_IMAGE = "image"
KIND_CERTIFICATE = "certificate"
