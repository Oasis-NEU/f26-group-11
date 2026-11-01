import os
from contextlib import contextmanager
from uuid import uuid4

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app.config import Settings, get_settings
from app.main import app
from app.repositories.postgres import Database


@pytest.fixture
def database_client(monkeypatch):
    if os.environ.get("RUN_DATABASE_TESTS") != "1":
        pytest.skip("Set RUN_DATABASE_TESTS=1 to test the migrated local PostgreSQL database")
    settings = Settings(repository_backend="postgres")
    if settings.database_url is None:
        pytest.fail("DATABASE_URL is required for database integration tests")
    # All fixtures and SQL queries share one transaction. No application rows or
    # identity sequence values survive this test, including when assertions fail.
    with (
        psycopg.connect(
            settings.database_url.get_secret_value(), row_factory=dict_row
        ) as connection,
        connection.transaction(force_rollback=True),
    ):
        user_id = uuid4()
        community_id = -int(uuid4().hex[:14], 16)
        slug = f"api-test-{uuid4().hex}"
        connection.execute(
            "insert into public.users (user_id, email, major) values (%s, %s, %s)",
            (user_id, f"api-{user_id}@example.com", "Computer Science"),
        )
        connection.execute(
            """insert into public.communities
                   (community_id, course_code, course_name, slug)
                   values (%s, %s, %s, %s)""",
            (community_id, f"API-{uuid4().hex}", "API Integration Course", slug),
        )

        @contextmanager
        def connect(self):
            yield connection

        monkeypatch.setattr(Database, "connect", connect)
        app.dependency_overrides[get_settings] = lambda: settings.model_copy(
            update={"app_env": "test", "dev_auth_enabled": True}
        )
        try:
            with TestClient(app) as client:
                yield client, user_id, community_id, slug
        finally:
            app.dependency_overrides.clear()


def test_database_backed_community_routes(database_client):
    client, _, community_id, slug = database_client
    response = client.get(f"/api/v1/communities/{slug}")
    assert response.status_code == 200
    community = response.json()
    assert community["community_id"] == community_id
    assert community["course_name"] == "API Integration Course"
    assert community["description"] is None
    assert community["created_at"]
    assert "name" not in community and "course_id" not in community
    assert community in client.get("/api/v1/communities").json()
    assert client.get(f"/api/v1/communities/missing-{uuid4().hex}").status_code == 404
    # The slug remains data even when it contains SQL punctuation.
    assert client.get("/api/v1/communities/%27%20OR%201%3D1--").status_code == 404


def test_database_backed_me_routes(database_client, monkeypatch):
    client, user_id, _, _ = database_client
    response = client.get("/api/v1/me", headers={"X-Dev-User": str(user_id)})
    assert response.status_code == 200
    assert response.json()["user_id"] == str(user_id)
    assert response.json()["display_name"] is None
    assert response.json()["major"] == "Computer Science"
    assert "role" not in response.json()
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/me", headers={"X-Dev-User": str(uuid4())}).status_code == 401

    monkeypatch.setattr(
        "app.auth.httpx.get", lambda *args, **kwargs: httpx.Response(200, json={"id": str(user_id)})
    )
    settings = get_settings().model_copy(
        update={
            "app_env": "prod",
            "repository_backend": "postgres",
            "supabase_url": "https://example.supabase.co",
        }
    )
    # Only the Auth HTTP response is simulated; the profile query is real SQL.
    from pydantic import SecretStr

    settings.supabase_publishable_key = SecretStr("test-key")
    app.dependency_overrides[get_settings] = lambda: settings
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer verified"}).status_code == 200
    assert client.get("/api/v1/me", headers={"X-Dev-User": str(user_id)}).status_code == 401


def test_missing_database_configuration_returns_safe_503(monkeypatch):
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/communities")
            assert response.status_code == 503
            assert response.json() == {"detail": "Database unavailable"}
            assert client.get("/api/v1/health").status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_connection_failure_returns_safe_503(monkeypatch):
    def connect(*args, **kwargs):
        raise psycopg.OperationalError("sensitive connection details")

    monkeypatch.setattr("app.repositories.postgres.psycopg.connect", connect)
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, database_url="postgresql://secret:password@db.invalid/database"
    )
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/communities")
            assert response.status_code == 503
            assert response.json() == {"detail": "Database unavailable"}
    finally:
        app.dependency_overrides.clear()
