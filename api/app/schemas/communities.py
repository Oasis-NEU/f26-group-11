from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CommunityOut(BaseModel):
    community_id: UUID
    slug: str
    name: str
    course_id: UUID | None = None
