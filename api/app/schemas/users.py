from uuid import UUID

from pydantic import BaseModel


class UserOut(BaseModel):
    user_id: UUID
    email: str
    first_name: str | None = None
    last_name: str | None = None
    year: str | None = None
    major: str | None = None
    minor: str | None = None
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
