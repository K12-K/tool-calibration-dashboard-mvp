python tools/generate_license.py \
  --customer "Acme Ltd" \
  --license-id "ACME-UAT-001" \
  --type evaluation \
  --expires 2026-11-13 \
  --private-key license_private.key \
  --output license.lic

python tools/generate_license.py --customer "Precision Adv Mfg" --license-id "PAM-UAT-001" --type evaluation --expires 2026-12-01 --private-key license_private.key --output license.lic


python tools/generate_license.py \
  --customer "Acme Ltd" \
  --license-id "ACME-PROD-001" \
  --type perpetual \
  --private-key license_private.key \
  --output license.lic

python tools/generate_license.py --customer "Precision Adv Mfg" --license-id "PAM-UAT-001" --type perpetual --private-key license_private.key --output license.lic


python tools/generate_license.py \
  --customer "Acme Ltd" \
  --license-id "ACME-10Y-001" \
  --type term \
  --expires 2036-10-13 \
  --private-key license_private.key \
  --output license.lic
