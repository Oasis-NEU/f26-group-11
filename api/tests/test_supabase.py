import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings, get_settings
from app.main import app
from app.repositories.fake import ALICE_ID, SEED_COMMUNITIES, SEED_USERS
from app.repositories.postgres import COMMUNITY_FIELDS, USER_FIELDS, DatabaseUnavailable
from app.repositories.supabase import SupabaseCommunityRepo, SupabaseDataAPI, SupabaseUserRepo


@pytest.fixture
def supabase_settings():
    return Settings(
        _env_file=None,
        app_env="prod",
        repository_backend="supabase",
        supabase_url="https://example.supabase.co",
        supabase_publishable_key=SecretStr("publishable-test-key"),
    )


def test_supabase_community_pagination_and_fields(monkeypatch, supabase_settings):
    calls = []
    pages = [[SEED_COMMUNITIES[0].model_dump(mode="json")], []]

    def request(url, **options):
        calls.append((url, options))
        return httpx.Response(200, json=pages.pop(0))

    monkeypatch.setattr("app.repositories.supabase.httpx.get", request)
    repo = SupabaseCommunityRepo(SupabaseDataAPI(supabase_settings))
    assert repo.list_all() == [SEED_COMMUNITIES[0]]
    assert len(calls) == 2
    assert calls[0][0] == "https://example.supabase.co/rest/v1/communities"
    assert calls[0][1]["params"] == {
        "select": COMMUNITY_FIELDS.replace(" ", ""),
        "order": "community_id.asc",
        "limit": "100",
        "offset": "0",
    }
    assert calls[1][1]["params"]["offset"] == "1"
    assert calls[0][1]["headers"] == {
        "apikey": "publishable-test-key",
        "Accept": "application/json",
    }


def test_supabase_slug_and_missing_row(monkeypatch, supabase_settings):
    def request(url, **options):
        assert options["params"]["slug"] == "eq.not-found"
        assert options["params"]["limit"] == "1"
        return httpx.Response(200, json=[])

    monkeypatch.setattr("app.repositories.supabase.httpx.get", request)
    assert (
        SupabaseCommunityRepo(SupabaseDataAPI(supabase_settings)).get_by_slug("not-found") is None
    )


def test_supabase_user_forwards_bearer_and_filters_identity(monkeypatch, supabase_settings):
    def request(url, **options):
        assert url == "https://example.supabase.co/rest/v1/users"
        assert options["headers"]["Authorization"] == "Bearer user-token"
        assert options["params"] == {
            "select": USER_FIELDS.replace(" ", ""),
            "user_id": f"eq.{ALICE_ID}",
            "limit": "1",
        }
        return httpx.Response(200, json=[SEED_USERS[0].model_dump(mode="json")])

    monkeypatch.setattr("app.repositories.supabase.httpx.get", request)
    assert (
        SupabaseUserRepo(SupabaseDataAPI(supabase_settings, "user-token")).get(ALICE_ID)
        == SEED_USERS[0]
    )


@pytest.mark.parametrize("status_code", [301, 400, 401, 403, 404, 429, 500])
def test_supabase_errors_do_not_fall_back_to_postgres(monkeypatch, supabase_settings, status_code):
    monkeypatch.setattr(
        "app.repositories.supabase.httpx.get",
        lambda *args, **kwargs: httpx.Response(
            status_code, json={"message": "sensitive upstream details"}
        ),
    )
    with pytest.raises(DatabaseUnavailable):
        SupabaseCommunityRepo(SupabaseDataAPI(supabase_settings)).get_by_slug("cs2100")


def test_supabase_missing_config_has_no_network_or_fallback(monkeypatch):
    def request(*args, **kwargs):
        pytest.fail("Unconfigured backend must not contact a service")

    monkeypatch.setattr("app.repositories.supabase.httpx.get", request)
    with pytest.raises(DatabaseUnavailable):
        SupabaseDataAPI(Settings(_env_file=None, repository_backend="supabase")).get("users", {})


@pytest.mark.parametrize("body", [{"unexpected": "object"}, [1], [{"community_id": "bad"}]])
def test_supabase_malformed_response_is_safe_failure(monkeypatch, supabase_settings, body):
    monkeypatch.setattr(
        "app.repositories.supabase.httpx.get",
        lambda *args, **kwargs: httpx.Response(200, json=body),
    )
    with pytest.raises(DatabaseUnavailable):
        SupabaseCommunityRepo(SupabaseDataAPI(supabase_settings)).get_by_slug("cs2100")


def test_supabase_me_verifies_token_before_forwarding_to_rls(monkeypatch, supabase_settings):
    calls = []

    def request(url, **options):
        calls.append(url)
        assert options["headers"]["Authorization"] == "Bearer user-token"
        if url.endswith("/auth/v1/user"):
            return httpx.Response(200, json={"id": str(ALICE_ID)})
        assert options["params"]["user_id"] == f"eq.{ALICE_ID}"
        return httpx.Response(200, json=[SEED_USERS[0].model_dump(mode="json")])

    monkeypatch.setattr("app.repositories.supabase.httpx.get", request)
    app.dependency_overrides[get_settings] = lambda: supabase_settings
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/me", headers={"Authorization": "Bearer user-token"})
            assert response.status_code == 200
            assert response.json()["user_id"] == str(ALICE_ID)
            assert calls == [
                "https://example.supabase.co/auth/v1/user",
                "https://example.supabase.co/rest/v1/users",
            ]
    finally:
        app.dependency_overrides.clear()
