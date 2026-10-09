"""Attachment storage on local disk (UPLOAD_DIR). Files are validated by content, not by name."""
import os
import re
import uuid
from pathlib import Path

from .config import settings

_IMAGE_SIGNATURES = [
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"GIF87a", "image/gif", ".gif"),
    (b"GIF89a", "image/gif", ".gif"),
]


def sniff_image(head: bytes) -> tuple[str, str] | None:
    for sig, mime, ext in _IMAGE_SIGNATURES:
        if head.startswith(sig):
            return mime, ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


def is_pdf(head: bytes) -> bool:
    return head[:1024].lstrip().startswith(b"%PDF-")


def clean_filename(name: str | None, fallback: str) -> str:
    base = os.path.basename((name or "").replace("\\", "/"))
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
    return (base or fallback)[:200]


def save_bytes(gauge_id: int, data: bytes, ext: str) -> str:
    stored = f"{gauge_id}/{uuid.uuid4().hex}{ext}"
    path = resolve(stored)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return stored


def resolve(stored_name: str) -> Path:
    root = settings.upload_path
    path = (root / stored_name).resolve()
    if root not in path.parents:
        raise ValueError("Invalid storage path")
    return path


def delete_file(stored_name: str) -> None:
    try:
        resolve(stored_name).unlink(missing_ok=True)
    except (ValueError, OSError):
        pass
