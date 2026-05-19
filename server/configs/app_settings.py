import os


class Settings:
    # MongoDB Settings
    MONGODB_DB: str = os.environ["DB_NAME"]
    MONGODB_HOST: str = os.environ["DB_HOST"]
    MONGODB_PORT: int = int(os.environ["DB_PORT"])
    MONGODB_USERNAME: str = os.environ["DB_USER"]
    MONGODB_PASSWORD: str = os.environ["DB_PASS"]

    # Celery Settings
    CELERY_RESULT_BACKEND: str = os.environ["CELERY_RESULT_BACKEND"]
    CELERY_BROKER_URL: str = os.environ["CELERY_BROKER_URL"]

    # Upload limits (for custom GFF uploads)
    # Max accepted payload size in bytes (default: 1.5 GiB)
    UPLOAD_MAX_BYTES: int = int(os.getenv("UPLOAD_MAX_BYTES", 1536 * 1024 * 1024))
    # Max accepted uploads per IP+User-Agent in a rolling 24h window (default: 50)
    UPLOAD_DAILY_LIMIT: int = int(os.getenv("UPLOAD_DAILY_LIMIT", 50))
    # Subdirectory under LOCAL_ANNOTATIONS_DIR where temporary uploads are stored
    UPLOAD_TMP_SUBDIR: str = os.getenv("UPLOAD_TMP_SUBDIR", "uploads_tmp")


settings = Settings()