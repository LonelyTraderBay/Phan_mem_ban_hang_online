from datetime import UTC, datetime

from fastapi import FastAPI
from pydantic import BaseModel


class HealthPayload(BaseModel):
    service: str
    status: str
    timestamp: str


def build_health_payload(service: str) -> HealthPayload:
    return HealthPayload(
        service=service,
        status="ok",
        timestamp=datetime.now(UTC).isoformat(),
    )


def create_app() -> FastAPI:
    app = FastAPI(title="AI Sales AI Service", version="0.1.0")

    @app.get("/health", response_model=HealthPayload)
    def health() -> HealthPayload:
        return build_health_payload("ai-service")

    @app.get("/ready", response_model=HealthPayload)
    def ready() -> HealthPayload:
        return build_health_payload("ai-service")

    return app


app = create_app()
