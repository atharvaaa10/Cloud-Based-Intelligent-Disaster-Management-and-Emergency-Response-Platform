"""
Disaster Management Platform - CLI Tools
Usage:
    python -m app.cli create-admin --email admin@example.com [--name "Admin Name"] [--password "Secret123!"]
"""

import argparse
import asyncio
import getpass
import os
import re
import sys

from sqlalchemy import select
from app.database import async_session
from app.models import User, RoleEnum
from app.auth import hash_password


async def create_admin(email: str, name: str, phone: str = None, password: str = None):
    # Retrieve password from flag, env, or interactive prompt
    if not password:
        password = os.getenv("ADMIN_PASSWORD")
    if not password:
        password = getpass.getpass(f"Enter password for admin account ({email}): ")

    if len(password) < 8 or not re.search(r"[A-Z0-9]", password):
        print("Error: Password must be at least 8 characters long and contain at least one uppercase letter or digit.", file=sys.stderr)
        sys.exit(1)

    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            print(f"Existing user found for {email}. Updating to role='admin'...")
            user.role = RoleEnum.admin
            user.full_name = name or user.full_name
            user.password_hash = hash_password(password)
            if phone:
                user.phone = phone
        else:
            print(f"Creating new admin user {email}...")
            user = User(
                email=email,
                full_name=name or "Administrator",
                name=name or "Administrator",
                phone=phone,
                password_hash=hash_password(password),
                role=RoleEnum.admin,
            )
            session.add(user)

        await session.commit()
        await session.refresh(user)
        print(f"[OK] Admin account created/updated successfully: id={user.id}, email={user.email}, role={user.role.value}")


def main():
    parser = argparse.ArgumentParser(description="DisasterResponse Platform Administrative CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create-admin subcommand
    admin_parser = subparsers.add_parser("create-admin", help="Create or promote an administrator account")
    admin_parser.add_argument("--email", required=True, help="Admin user email address")
    admin_parser.add_argument("--name", "--full-name", dest="name", default="Platform Administrator", help="Admin full name")
    admin_parser.add_argument("--phone", default=None, help="Admin phone number")
    admin_parser.add_argument("--password", default=None, help="Password (or set ADMIN_PASSWORD env / prompt interactively)")

    args = parser.parse_args()

    if args.command == "create-admin":
        asyncio.run(create_admin(
            email=args.email,
            name=args.name,
            phone=args.phone,
            password=args.password,
        ))


if __name__ == "__main__":
    main()
