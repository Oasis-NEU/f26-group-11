from uuid import UUID

from app.schemas.communities import CommunityOut
from app.schemas.users import UserOut

ALICE_ID = UUID("00000000-0000-0000-0000-000000000001")  # student
BOB_ID = UUID("00000000-0000-0000-0000-000000000002")  # faculty
ADMIN_ID = UUID("00000000-0000-0000-0000-000000000003")  # admin

CS2100_ID = UUID("10000000-0000-0000-0000-000000000001")
CS3000_ID = UUID("10000000-0000-0000-0000-000000000002")
CS3650_ID = UUID("10000000-0000-0000-0000-000000000003")

SEED_USERS = [
    UserOut(user_id=ALICE_ID, email="alice@northeastern.edu", display_name="Alice", role="student"),
    UserOut(user_id=BOB_ID, email="bob@northeastern.edu", display_name="Prof. Bob", role="faculty"),
    UserOut(user_id=ADMIN_ID, email="admin@northeastern.edu", display_name="Admin", role="admin"),
]

SEED_COMMUNITIES = [
    CommunityOut(
        community_id=CS2100_ID,
        slug="cs2100",
        name="CS2100: Program Implementation & Design 1",
    ),
    CommunityOut(
        community_id=CS3000_ID,
        slug="cs3000",
        name="CS3000: Algorithms & Data",
    ),
    CommunityOut(
        community_id=CS3650_ID,
        slug="cs3650",
        name="CS3650: Computer Systems",
    ),
]


class FakeUserRepo:
    def __init__(self) -> None:
        self._users = {
            u.id: u for u in SEED_USERS
        }

    def get(self, user_id: UUID) -> UserOut | None:
        return self._users.get(user_id)

class FakeCommunityRepo:
    def __init__(self) -> None:
        self._by_slug = {
            c.slug: c for c in SEED_COMMUNITIES
        }

    def list_all(self) -> list[CommunityOut]:
        return list(self._by_slug.values())

    def get_by_slug(self, slug: str) -> CommunityOut | None:
        return self._by_slug.get(community_id)