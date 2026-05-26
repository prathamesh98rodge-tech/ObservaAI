"""
POST /estimate — pre-flight cost and token estimate for a prompt.

Body: { provider, model, messages: [{ role, content }] }
Response: { estimated_input_tokens, estimated_cost_usd, context_pct }
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.pricing import estimate_cost, context_window_pct, estimate_tokens

router = APIRouter(tags=["estimate"])


class EstimateRequest(BaseModel):
    provider: str
    model: str
    messages: list[dict]


@router.post("/estimate")
async def estimate(body: EstimateRequest):
    tokens = estimate_tokens(body.provider, body.model, body.messages)
    cost = estimate_cost(body.provider, body.model, tokens, 0)
    ctx_pct = context_window_pct(body.model, tokens)
    return {
        "estimated_input_tokens": tokens,
        "estimated_cost_usd": round(cost, 6),
        "context_pct": ctx_pct,
    }
