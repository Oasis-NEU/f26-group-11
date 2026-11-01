from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.config import Settings


def unauthorized() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_supabase_user(token: str, settings: Settings) -> UUID:
    """Resolve the identity using Supabase Auth's server-verified user endpoint."""
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication unavailable")
    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_publishable_key.get_secret_value(),
                "Authorization": f"Bearer {token}",
            },
            timeout=5.0,
            follow_redirects=False,
        )
    except httpx.RequestError as error:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication unavailable"
        ) from error
    if response.status_code in (400, 401, 403):
        raise unauthorized()
    if response.status_code != 200:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication unavailable")
    try:
        user_id = response.json()["id"]
        if not isinstance(user_id, str):
            raise TypeError("Unexpected Auth identity")
        return UUID(user_id)
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication unavailable"
        ) from error
