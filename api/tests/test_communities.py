def test_list_communities(client):
    r = client.get("/api/v1/communities")
    assert r.status_code == 200
    assert {c["slug"] for c in r.json()} == {"cs2100", "cs3000", "cs3650"}


def test_get_community(client):
    response = client.get("/api/v1/communities/cs3000")
    assert response.status_code == 200
    assert response.json() == {
        "community_id": 2,
        "course_code": "CS3000",
        "course_name": "Algorithms & Data",
        "slug": "cs3000",
        "description": None,
        "created_at": "2026-11-01T00:00:00Z",
    }
    assert client.get("/api/v1/communities/nope").status_code == 404
