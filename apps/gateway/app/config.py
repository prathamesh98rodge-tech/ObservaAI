from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ObservaAI Gateway"
    debug: bool = False
    database_url: str = "sqlite+aiosqlite:///./observaai.db"

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    gateway_url: str = "http://localhost:8000"


settings = Settings()
