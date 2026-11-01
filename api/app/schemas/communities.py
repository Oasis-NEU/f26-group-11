from datetime import datetime

from pydantic import BaseModel


class CommunityOut(BaseModel):
    community_id: int
    course_code: str
    course_name: str
    slug: str
    description: str | None = None
    created_at: datetime
