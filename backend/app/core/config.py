from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    APP_NAME: str = "RegWatch"
    SECRET_KEY: str = Field(..., description="Secret key for JWT signing")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Celery configuration ( Optional, uncomment if using Celery )
    # BROKER_URL: str = "redis://localhost:6379/0"
    # REDIS_BACKEND: str = "redis://localhost:6379/1"

    MYSQL_SERVER: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = "law_db"

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION_NAME: str = "law_collection"

    CHUNK_SIZE: int = Field(default=1000, description="Size of each chunk for processing")
    CHUNK_OVERLAP: int = Field(default=100, description="Overlap between chunks")
    EMBEDDING_DIMENSION: int = Field(default=1536, description="Dimension of the embedding vector")

    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"

    GEMINI_API_KEY: str = "" 
    GEMINI_MODEL: str = "gemini-2.5-flash"

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )
    
    @property
    def qdrant_url(self) -> str:
        """Construct Qdrant connection URL dynamically."""
        return f"http://{self.QDRANT_HOST}:{self.QDRANT_PORT}"

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,   
        # Set to "ignore" to allow extra fields in the .env file without raising validation errors
        extra="ignore",  
    )

settings = Settings()