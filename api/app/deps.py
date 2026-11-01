from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import unauthorized, verify_supabase_user
from app.config import Settings, get_settings
from app.repositories.base import CommunityRepo, UserRepo
from app.repositories.postgres import Database, PostgresCommunityRepo, PostgresUserRepo
from app.repositories.supabase import SupabaseCommunityRepo, SupabaseDataAPI, SupabaseUserRepo
from app.schemas.users import UserOut

SettingsDep = Annotated[Settings, Depends(get_settings)]
bearer = HTTPBearer(auto_error=False)


def get_user_repo(
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> UserRepo:
    if settings.repository_backend == "supabase":
        token = credentials.credentials if credentials is not None else None
        return SupabaseUserRepo(SupabaseDataAPI(settings, token))
    return PostgresUserRepo(Database(settings.database_url))


def get_community_repo(settings: SettingsDep) -> CommunityRepo:
    if settings.repository_backend == "supabase":
        return SupabaseCommunityRepo(SupabaseDataAPI(settings))
    return PostgresCommunityRepo(Database(settings.database_url))


def get_optional_user(
    settings: SettingsDep,
    users: Annotated[UserRepo, Depends(get_user_repo)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    authorization: Annotated[str | None, Header()] = None,
    x_dev_user: Annotated[str | None, Header()] = None,
) -> UserOut | None:
    if credentials is not None:
        user_id = verify_supabase_user(credentials.credentials, settings)
        user = users.get(user_id)
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User profile not found")
        return user
    if authorization is not None:
        raise unauthorized()
    if settings.app_env != "prod" and settings.dev_auth_enabled and x_dev_user is not None:
        try:
            return users.get(UUID(x_dev_user))
        except ValueError:
            raise unauthorized()
    return None


def get_current_user(
    user: Annotated[UserOut | None, Depends(get_optional_user)],
) -> UserOut:
    if user is None:
        raise unauthorized()
    return user


CurrentUser = Annotated[UserOut, Depends(get_current_user)]
OptionalUser = Annotated[UserOut | None, Depends(get_optional_user)]
CommunityRepoDep = Annotated[CommunityRepo, Depends(get_community_repo)]
