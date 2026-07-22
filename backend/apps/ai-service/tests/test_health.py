from fastapi.testclient import TestClient

from app.main import create_app


def test_health_endpoint() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["service"] == "ai-service"
    assert response.json()["status"] == "ok"


def test_completion_stub() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/v1/completions",
        json={"system_prompt": "You are helpful.", "user_prompt": "Hello"},
    )

    assert response.status_code == 200
    assert "replyText" in response.json()["text"]
    assert response.json()["provider"] == "stub"
