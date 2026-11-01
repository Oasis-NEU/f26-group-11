from typing import Protocol
from uuid import UUID

from app.schemas.communities import CommunityOut
from app.schemas.users import UserOut


class UserRepo(Protocol):
    def get(self, user_id: UUID) -> UserOut | None: ...


class CommunityRepo(Protocol):
    def list_all(self) -> list[CommunityOut]: ...

    def get_by_slug(self, slug: str) -> CommunityOut | None: ...
