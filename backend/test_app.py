from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_home():
    r = client.get("/")
    assert r.status_code == 200
    assert "ViralClip" in r.text

def test_invalid_youtube_url():
    assert client.get("/youtube/metadata", params={"url": "https://example.com"}).status_code == 400

def test_missing_upload():
    assert client.post("/clips").status_code == 422
