import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request, session
from werkzeug.utils import secure_filename

from models.db import db
from models.models import Attachment, CallRoom, Channel, ChannelCategory, Message, MessageReaction, User
from routes.auth import login_required
from services.channels import (
    ALLOWED_ICONS,
    create_category,
    create_channel,
    get_organization_channels_payload,
    normalize_icon,
    user_can_access_channel,
)

channels_bp = Blueprint("channels", __name__, url_prefix="/api")

ALLOWED_ATTACH_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".doc", ".docx",
                               ".xls", ".xlsx", ".zip", ".txt", ".mp4", ".mov", ".mp3",
                               ".webm", ".ogg", ".wav", ".m4a"}
MAX_ATTACH_BYTES = 25 * 1024 * 1024  # 25 MB

ATTACH_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads" / "attachments"
ALLOWED_REACTIONS = {"👍", "❤️", "😂", "😮", "😢", "🔥", "✅", "👀", "🎉", "💯"}


def _require_org(user: User):
    if not user.organization_id:
        return None, (jsonify({"error": "Сначала создайте workspace"}), 400)
    return user.organization_id, None


@channels_bp.route("/channels")
@login_required
def list_channels():
    user = User.query.get_or_404(session["user_id"])
    org_id, error = _require_org(user)
    if error:
        return error

    return jsonify(get_organization_channels_payload(org_id))


@channels_bp.route("/channels", methods=["POST"])
@login_required
def create_channel_route():
    user = User.query.get_or_404(session["user_id"])
    org_id, error = _require_org(user)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Укажите название канала"}), 400

    category_id = data.get("category_id")
    if category_id is not None:
        category_id = int(category_id) if category_id else None

    try:
        channel = create_channel(
            org_id,
            user.id,
            name,
            icon=data.get("icon"),
            description=data.get("description"),
            category_id=category_id,
            channel_type=(data.get("channel_type") or "text").strip(),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404

    return jsonify({"channel": channel.to_dict()})


@channels_bp.route("/channels/<int:channel_id>", methods=["PUT"])
@login_required
def update_channel(channel_id):
    user = User.query.get_or_404(session["user_id"])
    org_id, error = _require_org(user)
    if error:
        return error

    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    data = request.get_json(silent=True) or {}

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Укажите название канала"}), 400
        channel.name = name[:120]

    if "description" in data:
        channel.description = (data.get("description") or "").strip()

    if "icon" in data:
        channel.icon = normalize_icon(data.get("icon"))

    if "category_id" in data:
        category_id = data.get("category_id")
        if category_id is None:
            channel.category_id = None
        else:
            category = ChannelCategory.query.filter_by(
                id=int(category_id),
                organization_id=org_id,
            ).first()
            if not category:
                return jsonify({"error": "Раздел не найден"}), 404
            channel.category_id = category.id

    db.session.commit()
    return jsonify({"channel": channel.to_dict()})


@channels_bp.route("/channels/<int:channel_id>", methods=["DELETE"])
@login_required
def delete_channel(channel_id):
    user = User.query.get_or_404(session["user_id"])
    _, error = _require_org(user)
    if error:
        return error

    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    from models.models import utcnow
    Message.query.filter_by(channel_id=channel.id).update({"deleted_at": utcnow()})
    db.session.delete(channel)
    db.session.commit()
    return jsonify({"ok": True})


@channels_bp.route("/channel-categories", methods=["POST"])
@login_required
def create_category_route():
    user = User.query.get_or_404(session["user_id"])
    org_id, error = _require_org(user)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Укажите название раздела"}), 400

    category = create_category(org_id, name)
    return jsonify({"category": category.to_dict()})


@channels_bp.route("/channel-categories/<int:category_id>", methods=["PUT"])
@login_required
def update_category(category_id):
    user = User.query.get_or_404(session["user_id"])
    org_id, error = _require_org(user)
    if error:
        return error

    category = ChannelCategory.query.filter_by(id=category_id, organization_id=org_id).first()
    if not category:
        return jsonify({"error": "Раздел не найден"}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Укажите название раздела"}), 400
        category.name = name[:120]

    db.session.commit()
    return jsonify({"category": category.to_dict()})


@channels_bp.route("/channel-categories/<int:category_id>", methods=["DELETE"])
@login_required
def delete_category(category_id):
    user = User.query.get_or_404(session["user_id"])
    org_id, error = _require_org(user)
    if error:
        return error

    category = ChannelCategory.query.filter_by(id=category_id, organization_id=org_id).first()
    if not category:
        return jsonify({"error": "Раздел не найден"}), 404

    Channel.query.filter_by(category_id=category.id).update({"category_id": None})
    db.session.delete(category)
    db.session.commit()
    return jsonify({"ok": True})


@channels_bp.route("/channels/icons")
@login_required
def channel_icons():
    return jsonify({"icons": sorted(ALLOWED_ICONS)})


@channels_bp.route("/channels/<int:channel_id>/messages")
@login_required
def channel_messages(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    messages = (
        Message.query.filter_by(channel_id=channel.id)
        .filter(Message.deleted_at.is_(None))
        .order_by(Message.created_at.asc())
        .limit(200)
        .all()
    )
    return jsonify({"messages": [msg.to_dict(current_user_id=user.id) for msg in messages]})


@channels_bp.route("/channels/<int:channel_id>/messages", methods=["POST"])
@login_required
def send_message(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Сообщение не может быть пустым"}), 400

    message = Message(channel_id=channel.id, user_id=user.id, content=content)
    db.session.add(message)
    db.session.commit()
    return jsonify({"message": message.to_dict(current_user_id=user.id)})


@channels_bp.route("/channels/<int:channel_id>/messages/<int:message_id>", methods=["DELETE"])
@login_required
def delete_message(channel_id, message_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    message = Message.query.filter_by(id=message_id, channel_id=channel_id).first_or_404()
    if message.user_id != user.id:
        return jsonify({"error": "Нельзя удалить чужое сообщение"}), 403

    from models.models import utcnow
    message.deleted_at = utcnow()
    db.session.commit()
    return jsonify({"ok": True})


@channels_bp.route("/channels/<int:channel_id>/messages/<int:message_id>/pin", methods=["PUT"])
@login_required
def pin_message(channel_id, message_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    message = Message.query.filter_by(id=message_id, channel_id=channel_id).first_or_404()
    message.is_pinned = not message.is_pinned
    db.session.commit()
    return jsonify({"message": message.to_dict(current_user_id=user.id)})


@channels_bp.route("/channels/<int:channel_id>/pinned")
@login_required
def pinned_messages(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    messages = (
        Message.query.filter_by(channel_id=channel_id, is_pinned=True)
        .filter(Message.deleted_at.is_(None))
        .order_by(Message.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({"messages": [msg.to_dict(current_user_id=user.id) for msg in messages]})


@channels_bp.route("/messages/<int:message_id>/reactions", methods=["POST"])
@login_required
def add_reaction(message_id):
    user_id = session["user_id"]
    data = request.get_json(silent=True) or {}
    emoji = (data.get("emoji") or "").strip()

    if emoji not in ALLOWED_REACTIONS:
        return jsonify({"error": "Недопустимая реакция"}), 400

    message = Message.query.filter_by(id=message_id).filter(Message.deleted_at.is_(None)).first_or_404()
    user = User.query.get_or_404(user_id)
    channel = Channel.query.get(message.channel_id)
    if not channel or not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    existing = MessageReaction.query.filter_by(
        message_id=message_id, user_id=user_id, emoji=emoji
    ).first()

    if existing:
        db.session.delete(existing)
    else:
        db.session.add(MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji))

    db.session.commit()
    db.session.refresh(message)
    return jsonify({"message": message.to_dict(current_user_id=user_id)})


@channels_bp.route("/channels/<int:channel_id>/attachments", methods=["POST"])
@login_required
def upload_attachment(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Файл не выбран"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_ATTACH_EXTENSIONS:
        return jsonify({"error": "Недопустимый тип файла"}), 400

    data = file.read()
    if len(data) > MAX_ATTACH_BYTES:
        return jsonify({"error": "Файл больше 25 МБ"}), 400

    ATTACH_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = secure_filename(file.filename)
    stored = f"attach_{user.id}_{uuid.uuid4().hex[:10]}{ext}"
    path = ATTACH_DIR / stored
    path.write_bytes(data)

    mime_type = file.mimetype or ""
    attachment = Attachment(
        channel_id=channel_id,
        user_id=user.id,
        original_name=safe_name[:255],
        stored_name=stored,
        url=f"/static/uploads/attachments/{stored}",
        size=len(data),
        mime_type=mime_type[:120],
    )
    db.session.add(attachment)
    db.session.flush()

    caption = (request.form.get("caption") or "").strip()[:1000]
    content = caption if caption else f"📎 {safe_name}"
    message = Message(
        channel_id=channel_id,
        user_id=user.id,
        content=content,
        attachment_id=attachment.id,
    )
    db.session.add(message)
    db.session.commit()

    return jsonify({"message": message.to_dict(current_user_id=user.id)})


@channels_bp.route("/channels/<int:channel_id>/calls", methods=["POST"])
@login_required
def start_call(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    import secrets as sec
    from models.models import utcnow

    active = CallRoom.query.filter_by(channel_id=channel_id, ended_at=None).first()
    if active:
        return jsonify({"call": active.to_dict()})

    token = sec.token_hex(16)
    call = CallRoom(channel_id=channel_id, created_by_id=user.id, token=token)
    db.session.add(call)
    db.session.flush()

    system_msg = Message(
        channel_id=channel_id,
        user_id=user.id,
        content=f"📞 {user.name} начал(а) звонок. [Присоединиться](https://meet.jit.si/openweb-{token})",
        is_agent=False,
    )
    db.session.add(system_msg)
    db.session.commit()

    return jsonify({"call": call.to_dict()})


@channels_bp.route("/channels/<int:channel_id>/calls/active")
@login_required
def active_call(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    call = CallRoom.query.filter_by(channel_id=channel_id, ended_at=None).first()
    return jsonify({"call": call.to_dict() if call else None})


@channels_bp.route("/channels/<int:channel_id>/calls/<int:call_id>", methods=["DELETE"])
@login_required
def end_call(channel_id, call_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа к каналу"}), 403

    from models.models import utcnow
    call = CallRoom.query.filter_by(id=call_id, channel_id=channel_id).first_or_404()
    call.ended_at = utcnow()
    db.session.commit()
    return jsonify({"ok": True})


# Thread endpoints
@channels_bp.route("/channels/<int:channel_id>/messages/<int:message_id>/thread")
@login_required
def get_thread(channel_id, message_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    parent = Message.query.filter_by(id=message_id, channel_id=channel_id).filter(Message.deleted_at.is_(None)).first_or_404()
    replies = (
        Message.query.filter_by(parent_id=message_id)
        .filter(Message.deleted_at.is_(None))
        .order_by(Message.created_at.asc())
        .all()
    )
    return jsonify({
        "parent": parent.to_dict(current_user_id=user.id),
        "replies": [r.to_dict(current_user_id=user.id) for r in replies],
    })


@channels_bp.route("/channels/<int:channel_id>/messages/<int:message_id>/reply", methods=["POST"])
@login_required
def reply_to_message(channel_id, message_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    parent = Message.query.filter_by(id=message_id, channel_id=channel_id).filter(Message.deleted_at.is_(None)).first_or_404()
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Ответ не может быть пустым"}), 400

    reply = Message(channel_id=channel_id, user_id=user.id, content=content, parent_id=message_id)
    db.session.add(reply)
    db.session.commit()
    return jsonify({"reply": reply.to_dict(current_user_id=user.id), "parent": parent.to_dict(current_user_id=user.id)})


# Pinned channels
@channels_bp.route("/channels/<int:channel_id>/pin", methods=["POST"])
@login_required
def pin_channel(channel_id):
    from models.models import PinnedChannel
    user_id = session["user_id"]
    channel = Channel.query.get_or_404(channel_id)
    existing = PinnedChannel.query.filter_by(user_id=user_id, channel_id=channel_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"pinned": False})
    max_pos = db.session.query(db.func.max(PinnedChannel.position)).filter_by(user_id=user_id).scalar() or 0
    db.session.add(PinnedChannel(user_id=user_id, channel_id=channel_id, position=max_pos + 1))
    db.session.commit()
    return jsonify({"pinned": True})


@channels_bp.route("/channels/pinned")
@login_required
def get_pinned_channels():
    from models.models import PinnedChannel
    user_id = session["user_id"]
    pinned = PinnedChannel.query.filter_by(user_id=user_id).order_by(PinnedChannel.position.asc()).all()
    channels = [Channel.query.get(p.channel_id) for p in pinned]
    channels = [c for c in channels if c]
    return jsonify({"channels": [c.to_dict() for c in channels]})
