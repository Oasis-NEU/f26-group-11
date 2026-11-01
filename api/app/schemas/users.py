from typing import Literal
from uuid import UUID

from pydantic import BaseModel

Role = Literal["student", "faculty", "admin"]


class UserOut(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: Role
