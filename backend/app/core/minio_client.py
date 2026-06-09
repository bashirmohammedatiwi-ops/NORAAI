from io import BytesIO
from pathlib import Path
from typing import BinaryIO

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


def copy_object(source_key: str, dest_key: str, content_type: str = "image/jpeg") -> str:
    """Server-side copy within the bucket (faster than download + re-upload)."""
    client = get_minio()
    ensure_bucket()
    from minio.commonconfig import CopySource

    client.copy_object(
        settings.minio_bucket,
        dest_key,
        CopySource(settings.minio_bucket, source_key),
    )
    return dest_key


def remove_object(key: str) -> None:
    client = get_minio()
    ensure_bucket()
    client.remove_object(settings.minio_bucket, key)


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


def object_exists(key: str) -> bool:
    client = get_minio()
    try:
        client.stat_object(settings.minio_bucket, key)
        return True
    except Exception:
        return False


def object_size(key: str) -> int | None:
    client = get_minio()
    try:
        stat = client.stat_object(settings.minio_bucket, key)
        return int(stat.size)
    except Exception:
        return None


def open_object(key: str, offset: int = 0, length: int = 0):
    """Return a MinIO get_object response; caller must close/release."""
    client = get_minio()
    if offset > 0 or length > 0:
        return client.get_object(
            settings.minio_bucket,
            key,
            offset=offset,
            length=length if length > 0 else 0,
        )
    return client.get_object(settings.minio_bucket, key)


def upload_stream(
    key: str,
    stream: BinaryIO,
    size: int,
    content_type: str = "application/octet-stream",
) -> str:
    client = get_minio()
    ensure_bucket()
    client.put_object(settings.minio_bucket, key, stream, size, content_type=content_type)
    return key


def upload_file_limited(
    key: str,
    file_obj: BinaryIO,
    max_bytes: int,
    content_type: str = "application/octet-stream",
    part_size: int = 16 * 1024 * 1024,
) -> int:
    """Stream upload from a file-like object without loading into RAM. Returns bytes written."""

    class LimitedReader:
        def __init__(self, inner: BinaryIO, limit: int):
            self._inner = inner
            self._limit = limit
            self.total = 0

        def read(self, n: int = -1) -> bytes:
            data = self._inner.read(n)
            self.total += len(data)
            if self.total > self._limit:
                raise ValueError(f"File exceeds max size ({self._limit} bytes)")
            return data

    client = get_minio()
    ensure_bucket()
    reader = LimitedReader(file_obj, max_bytes)
    client.put_object(
        settings.minio_bucket,
        key,
        reader,
        length=-1,
        part_size=part_size,
        content_type=content_type,
    )
    if reader.total == 0:
        raise ValueError("Empty file")
    return reader.total


def download_to_path(key: str, dest: Path, chunk_size: int = 8 * 1024 * 1024) -> Path:
    client = get_minio()
    response = client.get_object(settings.minio_bucket, key)
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as out:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
    finally:
        response.close()
        response.release_conn()
    return dest
