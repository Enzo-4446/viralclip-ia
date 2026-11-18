import os
os.environ["VIRAL_HELPER_DEV"] = "1"
from fastapi.testclient import TestClient
import helper

client = TestClient(helper.app)
ORIGIN = {"Origin": "https://enzo-4446.github.io"}

def test_origin_is_restricted():
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403

def test_health():
    response = client.get("/health", headers=ORIGIN)
    assert response.status_code == 200
    assert response.json()["ok"] is True

def test_pair_requires_pin():
    response = client.post("/pair", json={"code": "000000" if helper.PIN != "000000" else "111111"}, headers=ORIGIN)
    assert response.status_code == 401

def test_job_requires_token():
    response = client.post("/jobs", json={"url": "https://youtu.be/abcdefghijk", "rights_declared": True, "clips": {"count": 1, "seconds": 60, "gap": 0}}, headers=ORIGIN)
    assert response.status_code == 401

def test_job_requires_rights():
    headers={**ORIGIN, "Authorization": "Bearer " + helper.TOKEN}
    response = client.post("/jobs", json={"url": "https://youtu.be/abcdefghijk", "rights_declared": False, "clips": {"count": 1, "seconds": 60, "gap": 0}}, headers=headers)
    assert response.status_code == 400
