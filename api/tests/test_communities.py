def test_list_communities(client):
    r = client.get("/api/v1/communities")
    assert r.status_code == 200
    assert {c["slug"] for c in r.json()} == {"cs2100", "cs3000", "cs3650"}


def test_get_community(client):
    assert client.get("/api/v1/communities/cs3000").status_code == 200
    assert client.get("/api/v1/communities/nope").status_code == 404