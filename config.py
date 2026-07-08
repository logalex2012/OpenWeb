import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".data" / "database.env")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://openweb:openweb@localhost:5432/openweb",
)
TIMEWEB_AI_AGENT_ID = os.getenv(
    "TIMEWEB_AI_AGENT_ID",
    "e6baf3ad-dbba-472a-a378-e88e54c3c56b",
)


def timeweb_ai_embed_url(collapsed: bool = True) -> str:
    flag = "true" if collapsed else "false"
    return (
        f"https://timeweb.cloud/api/v1/cloud-ai/agents/"
        f"{TIMEWEB_AI_AGENT_ID}/embed.js?collapsed={flag}"
    )
