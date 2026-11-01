from app.repositories.fake import ALICE_ID


def test_me_requires_login(client):
    assert client.get("/api/v1/me").status_code == 401

def test_me_returns_dev_user(client):
    r = client.get("/api/v1/me", headers={"X-Dev-User" : str(ALICE_ID)})
    assert r.status_code == 200
    assert r.json()["id"] == str(ALICE_ID)
    assert r.json()["role"] == "student"

def test_me_unknown_user(client):
    r = client.get("/api/v1/me", headers={"X-Dev-User": "99999999-9999-9999-9999-999999999999"})
    assert r.status_code == 401