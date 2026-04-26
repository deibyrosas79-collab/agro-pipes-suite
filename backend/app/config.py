import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BASE_DIR / "instance" / "agro_pipes.db"


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-CHANGE-IN-PRODUCTION")

    _db_url = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")
    # Render PostgreSQL URLs use 'postgres://' but SQLAlchemy needs 'postgresql://'
    SQLALCHEMY_DATABASE_URI = _db_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    TOKEN_MAX_AGE = int(os.getenv("TOKEN_MAX_AGE", "43200"))

    CORS_ORIGINS = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:19006,http://localhost:4173,http://localhost:8081",
        ).split(",")
        if o.strip()
    ]
