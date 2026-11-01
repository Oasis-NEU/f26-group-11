from uuid import UUID

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.repositories.postgres import COMMUNITY_FIELDS, USER_FIELDS, DatabaseUnavailable
from app.schemas.communities import CommunityOut
from app.schemas.users import UserOut


class SupabaseDataAPI:
    def __init__(self, settings: Settings, token: str | None = None):
        self.settings = settings
        self.token = token

    def get(self, table: str, params: dict[str, str]) -> list[dict]:
        if not self.settings.supabase_url or not self.settings.supabase_publishable_key:
            raise DatabaseUnavailable()
        headers = {
            "apikey": self.settings.supabase_publishable_key.get_secret_value(),
            "Accept": "application/json",
        }
        if self.token is not None:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            response = httpx.get(
                f"{self.settings.supabase_url.rstrip('/')}/rest/v1/{table}",
                headers=headers,
                params=params,
                timeout=5.0,
                follow_redirects=False,
            )
            if response.status_code != 200:
                raise DatabaseUnavailable()
            rows = response.json()
            if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
                raise DatabaseUnavailable()
            return rows
        except (httpx.RequestError, ValueError) as error:
            raise DatabaseUnavailable() from error


class SupabaseUserRepo:
    def __init__(self, api: SupabaseDataAPI):
        self.api = api

    def get(self, user_id: UUID) -> UserOut | None:
        rows = self.api.get(
            "users",
            {
                "select": USER_FIELDS.replace(" ", ""),
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        try:
            return UserOut.model_validate(rows[0]) if rows else None
        except ValidationError as error:
            raise DatabaseUnavailable() from error


class SupabaseCommunityRepo:
    def __init__(self, api: SupabaseDataAPI):
        self.api = api

    def list_all(self) -> list[CommunityOut]:
        communities = []
        offset = 0
        while True:
            rows = self.api.get(
                "communities",
                {
                    "select": COMMUNITY_FIELDS.replace(" ", ""),
                    "order": "community_id.asc",
                    "limit": "100",
                    "offset": str(offset),
                },
            )
            if not rows:
                return communities
            try:
                communities.extend(CommunityOut.model_validate(row) for row in rows)
            except ValidationError as error:
                raise DatabaseUnavailable() from error
            offset += len(rows)

    def get_by_slug(self, slug: str) -> CommunityOut | None:
        rows = self.api.get(
            "communities",
            {
                "select": COMMUNITY_FIELDS.replace(" ", ""),
                "slug": f"eq.{slug}",
                "limit": "1",
            },
        )
        try:
            return CommunityOut.model_validate(rows[0]) if rows else None
        except ValidationError as error:
            raise DatabaseUnavailable() from error
