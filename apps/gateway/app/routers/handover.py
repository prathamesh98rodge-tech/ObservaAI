"""
POST /handover/generate — package conversation context for provider switching.

Accepts a summary of the current session and returns a formatted handover
document the user can paste into any other AI provider's chat UI.
"""
from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/handover", tags=["handover"])


class HandoverRequest(BaseModel):
    current_provider: str           # e.g. "claude"
    next_provider: str              # e.g. "openai"
    goal: str                       # what you were working on
    context_summary: str            # paste the key context / what's been decided
    files_in_scope: list[str] = []  # file paths relevant to the task
    last_message: str = ""          # the last message sent before hitting limit


@router.post("/generate")
async def generate_handover(body: HandoverRequest):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    files_section = ""
    if body.files_in_scope:
        files_section = "\n\n## Files in scope\n" + "\n".join(f"- `{f}`" for f in body.files_in_scope)

    last_msg_section = ""
    if body.last_message:
        last_msg_section = f"\n\n## Last message sent\n```\n{body.last_message}\n```"

    handover_md = f"""# ObservaAI Handover — {now}

**Switching from:** {body.current_provider.title()} → **{body.next_provider.title()}**

## Goal
{body.goal}

## Context summary
{body.context_summary}{files_section}{last_msg_section}

## Instructions for {body.next_provider.title()}
You are continuing a coding session that was started in {body.current_provider.title()}.
Read the context summary and files above, then continue from where we left off.
Ask me to clarify anything that is ambiguous before writing code.
"""

    return {
        "handover_md": handover_md,
        "from_provider": body.current_provider,
        "to_provider": body.next_provider,
        "generated_at": now,
    }
