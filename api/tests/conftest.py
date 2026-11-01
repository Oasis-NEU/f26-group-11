import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.deps import get_community_repo, get_user_repo
from app.main import app
from app.repositories.fake import FakeCommunityRepo, FakeUserRepo


@pytest.fixture
def client():
    users = FakeUserRepo()
    communities = FakeCommunityRepo()
    app.dependency_overrides[get_user_repo] = lambda: users
    app.dependency_overrides[get_community_repo] = lambda: communities
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        app_env="test",
        dev_auth_enabled=True,
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="test-publishable-key",
    )
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
