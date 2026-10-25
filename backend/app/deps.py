"""
Reusable FastAPI dependencies for authentication and role-based access.
"""

import time
from collections import defaultdict
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decode_access_token
from app.database import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode JWT, fetch the user, and return it — or raise 401."""
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id: int | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_roles(*allowed_roles: str):
    """Factory that returns a dependency enforcing role membership."""

    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed_roles)}",
            )
        return current_user

    return _check


# Alias: singular form for readability
def require_role(*allowed_roles: str):
    """Alias for require_roles. Accepts one or more role names."""
    return require_roles(*allowed_roles)


# ── In-memory rate limiting for login ────────────────────────────
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 60        # seconds
_RATE_LIMIT_MAX_ATTEMPTS = 5   # per window per IP


def rate_limit_login(request: Request) -> None:
    """Dependency: allow max 5 login attempts per IP per 60 seconds."""
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW

    # Drop timestamps outside the window
    _login_attempts[ip] = [t for t in _login_attempts[ip] if t > window_start]

    if len(_login_attempts[ip]) >= _RATE_LIMIT_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait a minute and try again.",
            headers={"Retry-After": "60"},
        )

    _login_attempts[ip].append(now)
