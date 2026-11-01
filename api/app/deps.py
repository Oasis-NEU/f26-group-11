from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings
from app.repositories.base import CommunityRepo, UserRepo
from app.repositories.fake import FakeUserRepo, FakeCommunityRepo
from app.schemas.users import UserOut


# Repositories: swap Fake for SQL here once DB is created.
@lru_cache
def get_user_repo() -> UserRepo:
    return FakeUserRepo()

@lru_cache
def get_community_repo() -> CommunityRepo:
    return FakeCommunityRepo()


def get_optional_user(
    settings: Annotated[Settings, Depends(get_settings)],
    users: Annotated[UserRepo, Depends(get_user_repo)],
    x_dev_user: Annotated[UUID | None, Header()] = None,
) -> UserOut | None:
    if settings.app_env == "prod" or x_dev_user is None:
        return None
    return users.get(x_dev_user)


def get_current_user(
    user: Annotated[UserOut | None, Depends(get_optional_user)],
) -> UserOut:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user



CurrentUser = Annotated[UserOut, Depends(get_current_user)]
OptionalUser = Annotated[UserOut | None, Depends(get_optional_user)]
CommunityRepoDep = Annotated[CommunityRepo, Depends(get_community_repo)]
