import argparse
import base64
import json
from datetime import date
from pathlib import Path

from cryptography.hazmat.primitives import serialization

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--customer", required=True)
    parser.add_argument("--license-id", required=True)
    parser.add_argument(
        "--type",
        choices=["evaluation", "perpetual", "term"],
        required=True,
    )
    parser.add_argument("--expires", help="YYYY-MM-DD; required for evaluation/term")
    parser.add_argument("--private-key", required=True)
    parser.add_argument("--output", default="license.lic")
    args = parser.parse_args()

    if args.type in {"evaluation", "term"} and not args.expires:
        parser.error("--expires is required for evaluation and term licenses")

    if args.expires:
        try:
            expiry = date.fromisoformat(args.expires)
        except ValueError:
            parser.error("--expires must use YYYY-MM-DD format")

        if expiry < date.today():
            parser.error("Expiry date must not be in the past")

    payload = {
        "license_id": args.license_id,
        "customer": args.customer,
        "product": "ToolCalibrationDashboard",
        "license_type": args.type,
        "expires_at": args.expires,
    }

    # Sign the exact serialized bytes. The verifier must check these same bytes.
    payload_bytes = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    private_key = serialization.load_pem_private_key(
        Path(args.private_key).read_bytes(),
        password=None,
    )

    signature = private_key.sign(payload_bytes)

    envelope = {
        "payload": base64.b64encode(payload_bytes).decode(),
        "signature": base64.b64encode(signature).decode(),
    }

    Path(args.output).write_text(
        json.dumps(envelope, indent=2),
        encoding="utf-8",
    )

    print(f"License written to {args.output}")

if __name__ == "__main__":
    main()
