from io import BytesIO

from minio import Minio

from app.core.config import get_settings

settings = get_settings()
_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _client


def ensure_bucket() -> None:
    client = get_minio()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    client = get_minio()
    ensure_bucket()
    client.put_object(settings.minio_bucket, key, BytesIO(data), len(data), content_type=content_type)
    return key


def download_bytes(key: str) -> bytes:
    client = get_minio()
    response = client.get_object(settings.minio_bucket, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()
