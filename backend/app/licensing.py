import base64
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PublicKey,
)

PUBLIC_KEY_B64 = "9I5JOGXJLpGWUmy2gMNZ7hpgZa2ya7Dp25FN+o3hOnM="

def load_license():
    path = os.getenv(
        "LICENSE_FILE",
        "/run/licenses/license.lic",
    )

    try:
        envelope = json.loads(Path(path).read_text("utf-8"))

        payload_bytes = base64.b64decode(
            envelope["payload"], validate=True
        )
        signature = base64.b64decode(
            envelope["signature"], validate=True
        )
        public_key = Ed25519PublicKey.from_public_bytes(
            base64.b64decode(PUBLIC_KEY_B64, validate=True)
        )

        public_key.verify(signature, payload_bytes)
        license_data = json.loads(payload_bytes)

        if license_data.get("product") != "ToolCalibrationDashboard":
            raise ValueError("Wrong product")

        license_type = license_data.get("license_type")
        if license_type not in {"evaluation", "term", "perpetual"}:
            raise ValueError("Invalid license type")

        expiry = license_data.get("expires_at")

        if license_type == "perpetual":
            if expiry is not None:
                raise ValueError("Invalid perpetual license")
        else:
            if not expiry:
                raise ValueError("Missing expiry date")

            expiry_date = date.fromisoformat(expiry)
            today = datetime.now(timezone.utc).date()

            if today > expiry_date:
                raise ValueError("License expired")

        return license_data

    except (OSError, ValueError, KeyError, TypeError,
            InvalidSignature, json.JSONDecodeError) as exc:
        raise RuntimeError(
            "License invalid, missing, or expired"
        ) from exc
