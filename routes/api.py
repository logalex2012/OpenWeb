from flask import Blueprint, jsonify, request, session

from models.db import db
from models.models import AgentConfig, AgentTask, Channel, Message, User, UserSettings
from services.channels import get_organization_channels_payload
from routes.auth import login_required
from routes.csrf import get_or_create_csrf_token, generate_csrf_token
from services.agent_service import generate_agent_reply
from services.avatars import clear_user_avatar, save_avatar
from services.link_preview import get_link_preview
from services.organization import get_user_organization, user_needs_onboarding
from services.user_settings import get_or_create_agent_config, get_or_create_user_settings

api_bp = Blueprint("api", __name__, url_prefix="/api")

VALID_THEMES = {"light", "dark", "system"}
VALID_TONES = {"professional", "friendly", "bold"}

_login_attempts: dict = {}
_register_attempts: dict = {}
_agent_attempts: dict = {}


def _rate_limit(store: dict, key: str, max_calls: int, window: int) -> bool:
    """Returns True if allowed, False if rate limited. Simple in-memory sliding window."""
    import time
    now = time.time()
    timestamps = store.get(key, [])
    timestamps = [t for t in timestamps if now - t < window]
    if len(timestamps) >= max_calls:
        store[key] = timestamps
        return False
    timestamps.append(now)
    store[key] = timestamps
    return True


def _client_key() -> str:
    return request.environ.get("HTTP_X_FORWARDED_FOR", request.remote_addr or "unknown")


def _validate_password(password: str) -> str | None:
    if len(password) < 8:
        return "Пароль должен содержать не менее 8 символов"
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not has_letter or not has_digit:
        return "Пароль должен содержать хотя бы одну букву и одну цифру"
    return None


@api_bp.route("/csrf-token")
def csrf_token():
    token = get_or_create_csrf_token()
    return jsonify({"csrf_token": token})


@api_bp.route("/auth/register", methods=["POST"])
def register():
    if not _rate_limit(_register_attempts, _client_key(), 5, 60):
        return jsonify({"error": "Слишком много попыток. Подождите минуту."}), 429

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    company = (data.get("company") or "").strip()

    if not email or not password or not name:
        return jsonify({"error": "Заполните имя, email и пароль"}), 400

    pw_error = _validate_password(password)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Пользователь с таким email уже существует"}), 409

    user = User(email=email, name=name, company=company)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    db.session.add(
        AgentConfig(
            user_id=user.id,
            name="OpenWeb AI",
            tone="professional",
            platforms="telegram,x,vk",
            enabled=True,
        )
    )
    db.session.add(UserSettings(user_id=user.id))
    db.session.commit()

    session["user_id"] = user.id
    csrf_tok = generate_csrf_token()
    return jsonify({"user": user.to_dict(), "csrf_token": csrf_tok})


@api_bp.route("/auth/login", methods=["POST"])
def login():
    if not _rate_limit(_login_attempts, _client_key(), 10, 60):
        return jsonify({"error": "Слишком много попыток входа. Подождите минуту."}), 429

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Неверный email или пароль"}), 401

    session["user_id"] = user.id
    csrf_tok = generate_csrf_token()
    return jsonify({"user": user.to_dict(), "csrf_token": csrf_tok})


@api_bp.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@api_bp.route("/me")
@login_required
def me():
    user = User.query.get(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "Пользователь не найден"}), 404

    settings = get_or_create_user_settings(user.id)
    organization = get_user_organization(user)
    return jsonify(
        {
            "user": user.to_dict(),
            "settings": settings.to_dict(),
            "onboarding_required": user_needs_onboarding(user),
            "organization": organization.to_dict() if organization else None,
        }
    )


@api_bp.route("/link-preview")
@login_required
def link_preview():
    url = request.args.get("url", "")
    return jsonify({"preview": get_link_preview(url)})


@api_bp.route("/settings")
@login_required
def get_settings():
    user = User.query.get_or_404(session["user_id"])
    settings = get_or_create_user_settings(user.id)
    agent = get_or_create_agent_config(user.id)
    channels_payload = (
        get_organization_channels_payload(user.organization_id)
        if user.organization_id
        else {"categories": [], "channels": []}
    )

    return jsonify(
        {
            "profile": user.to_dict(),
            "workspace": settings.to_dict(),
            "agent": agent.to_dict(),
            "categories": channels_payload["categories"],
            "channels": channels_payload["channels"],
        }
    )


@api_bp.route("/settings/profile", methods=["PUT"])
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    user = User.query.get_or_404(session["user_id"])

    name = (data.get("name") or "").strip()
    company = (data.get("company") or "").strip()
    email = (data.get("email") or "").strip().lower()
    job_title = (data.get("job_title") or "").strip()
    status_message = (data.get("status_message") or "").strip()

    if not name:
        return jsonify({"error": "Укажите имя"}), 400

    if email and email != user.email:
        if User.query.filter(User.email == email, User.id != user.id).first():
            return jsonify({"error": "Email уже используется"}), 409
        user.email = email

    user.name = name
    user.company = company

    settings = get_or_create_user_settings(user.id)
    settings.job_title = job_title
    settings.status_message = status_message[:255]

    db.session.commit()
    return jsonify({"user": user.to_dict(), "settings": settings.to_dict()})


@api_bp.route("/settings/avatar", methods=["POST"])
@login_required
def upload_avatar():
    user = User.query.get_or_404(session["user_id"])
    settings = get_or_create_user_settings(user.id)

    file = request.files.get("avatar")
    try:
        avatar_url = save_avatar(user.id, file)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    clear_user_avatar(settings)
    settings.avatar_url = avatar_url
    db.session.commit()

    return jsonify({"settings": settings.to_dict(), "avatar_url": avatar_url})


@api_bp.route("/settings/avatar", methods=["DELETE"])
@login_required
def delete_avatar():
    settings = get_or_create_user_settings(session["user_id"])
    clear_user_avatar(settings)
    db.session.commit()
    return jsonify({"settings": settings.to_dict()})


@api_bp.route("/settings/password", methods=["PUT"])
@login_required
def update_password():
    data = request.get_json(silent=True) or {}
    user = User.query.get_or_404(session["user_id"])

    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not user.check_password(current_password):
        return jsonify({"error": "Неверный текущий пароль"}), 401

    pw_error = _validate_password(new_password)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    user.set_password(new_password)
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.route("/settings/workspace", methods=["PUT"])
@login_required
def update_workspace():
    data = request.get_json(silent=True) or {}
    settings = get_or_create_user_settings(session["user_id"])

    if "workspace_name" in data:
        workspace_name = (data.get("workspace_name") or "OpenWeb").strip()
        if not workspace_name:
            return jsonify({"error": "Укажите название пространства"}), 400
        settings.workspace_name = workspace_name[:120]

    if "theme" in data:
        theme = data.get("theme", "light")
        if theme not in VALID_THEMES:
            return jsonify({"error": "Недопустимая тема"}), 400
        settings.theme = theme

    if "compact_mode" in data:
        settings.compact_mode = bool(data["compact_mode"])

    if "notifications" in data:
        settings.notifications = bool(data["notifications"])

    if "default_channel_slug" in data:
        slug = (data.get("default_channel_slug") or "").strip()
        user = User.query.get(session["user_id"])
        if slug and user and user.organization_id:
            channel = Channel.query.filter_by(
                organization_id=user.organization_id,
                slug=slug,
            ).first()
            if not channel:
                return jsonify({"error": "Канал не найден"}), 404
        settings.default_channel_slug = slug or settings.default_channel_slug

    db.session.commit()
    return jsonify({"settings": settings.to_dict()})


@api_bp.route("/agent/config")
@login_required
def agent_config():
    config = get_or_create_agent_config(session["user_id"])
    return jsonify({"config": config.to_dict()})


@api_bp.route("/agent/config", methods=["PUT"])
@login_required
def update_agent_config():
    data = request.get_json(silent=True) or {}
    config = get_or_create_agent_config(session["user_id"])

    if "name" in data:
        config.name = (data["name"] or "OpenWeb AI").strip()
    if "tone" in data:
        tone = data["tone"]
        if tone not in VALID_TONES:
            return jsonify({"error": "Недопустимый тон"}), 400
        config.tone = tone
    if "platforms" in data:
        platforms = data["platforms"]
        if isinstance(platforms, list):
            config.platforms = ",".join(platforms)
        else:
            config.platforms = platforms
    if "enabled" in data:
        config.enabled = bool(data["enabled"])

    db.session.commit()
    return jsonify({"config": config.to_dict()})


@api_bp.route("/agent/run", methods=["POST"])
@login_required
def run_agent():
    user_id = session["user_id"]
    if not _rate_limit(_agent_attempts, str(user_id), 20, 3600):
        return jsonify({"error": "Лимит запросов к агенту исчерпан. Подождите час."}), 429

    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    channel_id = data.get("channel_id")

    if not prompt:
        return jsonify({"error": "Опишите задачу для агента"}), 400

    config = AgentConfig.query.filter_by(user_id=user_id).first()
    tone = config.tone if config else "professional"
    platforms = config.platforms.split(",") if config and config.platforms else None

    response = generate_agent_reply(prompt, tone=tone, platforms=platforms)

    task = AgentTask(
        user_id=user_id,
        channel_id=channel_id,
        prompt=prompt,
        response=response,
        status="completed",
    )
    db.session.add(task)

    agent_message = None
    if channel_id:
        user_message = Message(channel_id=channel_id, user_id=user_id, content=f"📝 {prompt}")
        db.session.add(user_message)
        db.session.flush()

        agent_message = Message(
            channel_id=channel_id,
            user_id=None,
            content=response,
            is_agent=True,
        )
        db.session.add(agent_message)

    db.session.commit()

    payload = {"task": task.to_dict()}
    if agent_message:
        payload["message"] = agent_message.to_dict()
        payload["user_message"] = user_message.to_dict()

    return jsonify(payload)
