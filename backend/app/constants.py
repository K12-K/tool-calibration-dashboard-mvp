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
KIND_TOOL_IMAGE = "tool_image"  # the single Tool/Equipment image
KIND_CERTIFICATE = "certificate"

LATEST_CERT_TAG = "LATEST CERT"
MAX_TAG_LENGTH = 100
MAX_USAGE_RANGE_MONTHS = 2


def normalize_tag(raw: str | None) -> str | None:
    """Trim; blank -> None; any casing of LATEST CERT -> the canonical text."""
    if raw is None:
        return None
    tag = raw.strip()
    if not tag:
        return None
    if tag.lower() == LATEST_CERT_TAG.lower():
        return LATEST_CERT_TAG
    return tag
