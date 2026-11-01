from datetime import UTC, datetime
from uuid import UUID

from app.schemas.communities import CommunityOut
from app.schemas.users import UserOut

ALICE_ID = UUID("00000000-0000-0000-0000-000000000001")
BOB_ID = UUID("00000000-0000-0000-0000-000000000002")

CREATED_AT = datetime(2026, 11, 1, tzinfo=UTC)

SEED_USERS = [
    UserOut(user_id=ALICE_ID, email="alice@northeastern.edu", display_name="Alice"),
    UserOut(user_id=BOB_ID, email="bob@northeastern.edu"),
]

SEED_COMMUNITIES = [
    CommunityOut(
        community_id=1,
        course_code="CS2100",
        course_name="Program Implementation & Design 1",
        slug="cs2100",
        created_at=CREATED_AT,
    ),
    CommunityOut(
        community_id=2,
        course_code="CS3000",
        course_name="Algorithms & Data",
        slug="cs3000",
        created_at=CREATED_AT,
    ),
    CommunityOut(
        community_id=3,
        course_code="CS3650",
        course_name="Computer Systems",
        slug="cs3650",
        created_at=CREATED_AT,
    ),
]


class FakeUserRepo:
    def __init__(self) -> None:
        self._users = {u.user_id: u for u in SEED_USERS}

    def get(self, user_id: UUID) -> UserOut | None:
        return self._users.get(user_id)


class FakeCommunityRepo:
    def __init__(self) -> None:
        self._by_slug = {c.slug: c for c in SEED_COMMUNITIES}

    def list_all(self) -> list[CommunityOut]:
        return list(self._by_slug.values())

    def get_by_slug(self, slug: str) -> CommunityOut | None:
        return self._by_slug.get(slug)
