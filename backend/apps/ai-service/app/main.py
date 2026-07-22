from datetime import UTC, datetime
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


class HealthPayload(BaseModel):
    service: str
    status: str
    timestamp: str
    otel_enabled: bool = False


class CompletionRequest(BaseModel):
    system_prompt: str = Field(min_length=1)
    user_prompt: str = Field(min_length=1)
    max_tokens: int = Field(default=256, ge=1, le=4096)


class CompletionResponse(BaseModel):
    text: str
    tokens_used: int
    latency_ms: int
    provider: str
    model: str


def build_health_payload(service: str) -> HealthPayload:
    return HealthPayload(
        service=service,
        status="ok",
        timestamp=datetime.now(UTC).isoformat(),
        otel_enabled=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") is not None,
    )


def create_app() -> FastAPI:
    app = FastAPI(title="AI Sales AI Service", version="0.1.0")
    timeout_ms = int(os.getenv("AI_GATEWAY_TIMEOUT_MS", "30000"))

    @app.get("/health", response_model=HealthPayload)
    def health() -> HealthPayload:
        return build_health_payload("ai-service")

    @app.get("/ready", response_model=HealthPayload)
    def ready() -> HealthPayload:
        return build_health_payload("ai-service")

    @app.post("/v1/completions", response_model=CompletionResponse)
    def completions(body: CompletionRequest) -> CompletionResponse:
        if timeout_ms <= 0:
            raise HTTPException(status_code=503, detail="AI_PROVIDER_UNAVAILABLE")
        suggestion = {
            "replyText": f"Stub reply for: {body.user_prompt[:120]}",
            "claims": [],
            "toolCalls": [],
            "confidence": 0.8,
            "schemaVersion": "suggestion-v1",
        }
        import json

        return CompletionResponse(
            text=json.dumps(suggestion),
            tokens_used=min(body.max_tokens, 256),
            latency_ms=1,
            provider="stub",
            model=os.getenv("AI_MODEL_NAME", "stub-gpt"),
        )

    return app


app = create_app()
