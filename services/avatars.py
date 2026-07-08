import os
import uuid
from pathlib import Path

from werkzeug.utils import secure_filename

from models.models import UserSettings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads" / "avatars"


def ensure_upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


def _extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return ext if ext in ALLOWED_EXTENSIONS else ""


def save_avatar(user_id: int, file_storage) -> str:
    if not file_storage or not file_storage.filename:
        raise ValueError("Файл не выбран")

    ext = _extension(file_storage.filename)
    if not ext:
        raise ValueError("Допустимы JPG, PNG, WEBP или GIF")

    data = file_storage.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise ValueError("Файл больше 2 МБ")

    upload_dir = ensure_upload_dir()
    filename = secure_filename(f"user_{user_id}_{uuid.uuid4().hex[:10]}{ext}")
    path = upload_dir / filename
    path.write_bytes(data)

    avatar_url = f"/static/uploads/avatars/{filename}"
    return avatar_url


def delete_avatar_file(avatar_url: str | None) -> None:
    if not avatar_url or not avatar_url.startswith("/static/uploads/avatars/"):
        return

    filename = Path(avatar_url).name
    path = UPLOAD_DIR / filename
    if path.exists():
        path.unlink()


def clear_user_avatar(settings: UserSettings) -> None:
    delete_avatar_file(settings.avatar_url)
    settings.avatar_url = ""
