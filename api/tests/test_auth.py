import httpx
import pytest

from app.config import Settings, get_settings
from app.main import app
from app.repositories.fake import ALICE_ID, BOB_ID


def auth_response(monkeypatch, status_code=200, body=None):
    calls = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(status_code, json=body if body is not None else {"id": str(ALICE_ID)})

    monkeypatch.setattr("app.auth.httpx.get", request)
    return calls


def test_bearer_uses_verified_identity_and_supabase_key(client, monkeypatch):
    calls = auth_response(monkeypatch)
    response = client.get(
        "/api/v1/me",
        headers={"Authorization": "Bearer access-token", "X-Dev-User": str(BOB_ID)},
    )
    assert response.status_code == 200
    assert response.json()["user_id"] == str(ALICE_ID)
    assert len(calls) == 1
    url, options = calls[0]
    assert url == "https://example.supabase.co/auth/v1/user"
    assert options["headers"] == {
        "apikey": "test-publishable-key",
        "Authorization": "Bearer access-token",
    }
    assert options["timeout"] == 5.0
    assert options["follow_redirects"] is False


@pytest.mark.parametrize("status_code", [400, 401, 403])
def test_rejected_token_cannot_fall_back_to_dev_user(client, monkeypatch, status_code):
    auth_response(monkeypatch, status_code, {"message": "private upstream details"})
    response = client.get(
        "/api/v1/me", headers={"Authorization": "Bearer expired", "X-Dev-User": str(ALICE_ID)}
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert "private upstream" not in response.text


@pytest.mark.parametrize("authorization", ["Basic abc", "Bearer", "Bearer "])
def test_malformed_authorization_is_unauthorized(client, authorization):
    assert client.get("/api/v1/me", headers={"Authorization": authorization}).status_code == 401


def test_auth_transport_failure_is_503(client, monkeypatch):
    def request(*args, **kwargs):
        raise httpx.ConnectError("secret upstream detail")

    monkeypatch.setattr("app.auth.httpx.get", request)
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer token"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Authentication unavailable"}


@pytest.mark.parametrize("status_code", [302, 429, 500, 503])
def test_auth_service_errors_are_503(client, monkeypatch, status_code):
    auth_response(monkeypatch, status_code)
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer token"})
    assert response.status_code == 503


@pytest.mark.parametrize("body", [{}, {"id": "bad"}, {"id": 123}, ["bad"]])
def test_invalid_auth_response_is_503(client, monkeypatch, body):
    auth_response(monkeypatch, body=body)
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer token"}).status_code == 503


def test_missing_profile_is_404(client, monkeypatch):
    auth_response(monkeypatch, body={"id": "99999999-9999-9999-9999-999999999999"})
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer token"})
    assert response.status_code == 404
    assert response.json() == {"detail": "User profile not found"}


@pytest.mark.parametrize("app_env,enabled", [("dev", False), ("prod", False), ("prod", True)])
def test_dev_impersonation_requires_opt_in_and_is_disabled_in_prod(client, app_env, enabled):
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        app_env=app_env,
        dev_auth_enabled=enabled,
    )
    response = client.get("/api/v1/me", headers={"X-Dev-User": str(ALICE_ID)})
    assert response.status_code == 401


def test_missing_auth_configuration_is_503(client):
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer token"})
    assert response.status_code == 503


def test_nullable_profile_fields(client):
    response = client.get("/api/v1/me", headers={"X-Dev-User": str(BOB_ID)})
    assert response.status_code == 200
    assert response.json()["display_name"] is None


def test_malformed_dev_user_is_401(client):
    assert client.get("/api/v1/me", headers={"X-Dev-User": "not-a-uuid"}).status_code == 401
