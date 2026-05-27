from fastapi import APIRouter
from app.config import settings

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/shell-exports")
async def shell_exports():
    """Return shell export lines for the current gateway URL."""
    base = settings.gateway_url.rstrip("/")
    return {
        "gatewayUrl": base,
        "exports": {
            "bash_zsh": (
                "# ObservaAI CLI detection — added by VS Code extension\n"
                f'export ANTHROPIC_BASE_URL="{base}/proxy/anthropic"\n'
                f'export OPENAI_BASE_URL="{base}/proxy/openai/v1"\n'
                f'export GEMINI_API_BASE="{base}/proxy/gemini/v1beta"'
            ),
            "fish": (
                "# ObservaAI CLI detection — added by VS Code extension\n"
                f'set -x ANTHROPIC_BASE_URL "{base}/proxy/anthropic"\n'
                f'set -x OPENAI_BASE_URL "{base}/proxy/openai/v1"\n'
                f'set -x GEMINI_API_BASE "{base}/proxy/gemini/v1beta"'
            ),
            "powershell": (
                "# ObservaAI CLI detection — added by VS Code extension\n"
                f'$env:ANTHROPIC_BASE_URL = "{base}/proxy/anthropic"\n'
                f'$env:OPENAI_BASE_URL = "{base}/proxy/openai/v1"\n'
                f'$env:GEMINI_API_BASE = "{base}/proxy/gemini/v1beta"'
            ),
        },
        "vars": {
            "ANTHROPIC_BASE_URL": f"{base}/proxy/anthropic",
            "OPENAI_BASE_URL": f"{base}/proxy/openai/v1",
            "GEMINI_API_BASE": f"{base}/proxy/gemini/v1beta",
        },
    }
