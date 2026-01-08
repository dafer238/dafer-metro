from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from .env file"""

    night_time_start: str = "22:00"
    night_time_end: str = "06:00"
    api_base_url: str = "https://api.metrobilbao.eus/metro/real-time"
    auto_refresh_interval: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings():
    """Get cached settings instance"""
    return Settings()
