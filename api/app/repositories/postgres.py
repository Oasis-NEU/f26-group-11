from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from pydantic import SecretStr

from app.schemas.communities import CommunityOut
from app.schemas.users import UserOut

COMMUNITY_FIELDS = "community_id, course_code, course_name, slug, description, created_at"
USER_FIELDS = (
    "user_id, email, first_name, last_name, year, major, minor, display_name, bio, avatar_url"
)


class DatabaseUnavailable(Exception):
    """An intentionally generic error; connection details must never reach clients."""


class Database:
    def __init__(self, url: SecretStr | None):
        self._url = url

    @contextmanager
    def connect(self) -> Iterator[psycopg.Connection]:
        if self._url is None:
            raise DatabaseUnavailable()
        # Disabling prepared statements also supports Supabase transaction pooling.
        # Keep credentials server-side; these read-only routes select explicit rows.
        try:
            with psycopg.connect(
                self._url.get_secret_value(),
                connect_timeout=5,
                prepare_threshold=None,
                row_factory=dict_row,
            ) as connection:
                yield connection
        except psycopg.Error as error:
            raise DatabaseUnavailable() from error


class PostgresUserRepo:
    def __init__(self, database: Database):
        self.database = database

    def get(self, user_id: UUID) -> UserOut | None:
        with self.database.connect() as connection:
            row = connection.execute(
                f"select {USER_FIELDS} from public.users where user_id = %s", (user_id,)
            ).fetchone()
        return UserOut.model_validate(row) if row is not None else None


class PostgresCommunityRepo:
    def __init__(self, database: Database):
        self.database = database

    def list_all(self) -> list[CommunityOut]:
        with self.database.connect() as connection:
            rows = connection.execute(
                f"select {COMMUNITY_FIELDS} from public.communities order by community_id"
            ).fetchall()
        return [CommunityOut.model_validate(row) for row in rows]

    def get_by_slug(self, slug: str) -> CommunityOut | None:
        with self.database.connect() as connection:
            row = connection.execute(
                f"select {COMMUNITY_FIELDS} from public.communities where slug = %s", (slug,)
            ).fetchone()
        return CommunityOut.model_validate(row) if row is not None else None
