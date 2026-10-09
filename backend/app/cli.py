"""Administrator helper commands (run on the server).

  python -m app.cli list-users
  python -m app.cli make-admin user@company.com
  python -m app.cli reset-2fa  user@company.com   # lost phone / authenticator app
  python -m app.cli disable-user user@company.com
  python -m app.cli enable-user  user@company.com
"""
import argparse
import sys

import qrcode
from sqlalchemy import select

from .database import SessionLocal, init_db
from .models import User
from .security import new_totp_secret, provisioning_uri


def _user(db, email: str) -> User:
    u = db.scalar(select(User).where(User.email == email.strip().lower()))
    if u is None:
        sys.exit(f"No user with email {email}")
    return u


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["list-users", "make-admin", "reset-2fa", "disable-user", "enable-user"])
    p.add_argument("email", nargs="?")
    args = p.parse_args()
    init_db()

    with SessionLocal() as db:
        if args.command == "list-users":
            for u in db.scalars(select(User).order_by(User.id)):
                state = "active" if u.is_active else "DISABLED"
                twofa = "2FA ok" if u.totp_confirmed else "2FA pending"
                print(f"{u.id:>4}  {u.email:<40} {u.role:<6} {state:<9} {twofa}")
            return
        if not args.email:
            sys.exit("Email is required for this command")
        u = _user(db, args.email)
        if args.command == "make-admin":
            u.role = "admin"
        elif args.command == "disable-user":
            u.is_active = False
            u.token_version += 1
        elif args.command == "enable-user":
            u.is_active = True
        elif args.command == "reset-2fa":
            secret = new_totp_secret()
            u.totp_secret, u.totp_confirmed, u.last_totp_step = secret, True, None
            u.token_version += 1
            uri = provisioning_uri(secret, u.email)
            db.commit()
            print("\nNew authenticator secret (hand over securely, then delete from your terminal history):")
            print(f"  Secret : {secret}")
            print(f"  URI    : {uri}\n")
            qr = qrcode.QRCode(border=1)
            qr.add_data(uri)
            qr.print_ascii(invert=True)
            return
        db.commit()
        print("Done.")


if __name__ == "__main__":
    main()
