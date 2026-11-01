from fastapi import APIRouter

from app.deps import CurrentUser
from app.schemas.users import UserOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def read_me(user: CurrentUser) -> UserOut:
    return user
