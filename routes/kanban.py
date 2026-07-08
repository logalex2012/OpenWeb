from flask import Blueprint, jsonify, request, session

from models.db import db
from models.models import Channel, KanbanCard, User
from routes.auth import login_required
from services.channels import user_can_access_channel

kanban_bp = Blueprint("kanban", __name__, url_prefix="/api")

VALID_COLUMNS = {"todo", "progress", "done"}
VALID_COLORS = {"", "red", "green", "blue", "yellow", "purple", "orange"}


@kanban_bp.route("/channels/<int:channel_id>/kanban")
@login_required
def get_kanban(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    cards = (
        KanbanCard.query.filter_by(channel_id=channel_id)
        .filter(KanbanCard.deleted_at.is_(None))
        .order_by(KanbanCard.column, KanbanCard.position)
        .all()
    )
    return jsonify({"cards": [c.to_dict() for c in cards]})


@kanban_bp.route("/channels/<int:channel_id>/kanban", methods=["POST"])
@login_required
def create_card(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Укажите название карточки"}), 400

    col = data.get("column", "todo")
    if col not in VALID_COLUMNS:
        col = "todo"

    max_pos = (
        db.session.query(db.func.max(KanbanCard.position))
        .filter_by(channel_id=channel_id, column=col)
        .filter(KanbanCard.deleted_at.is_(None))
        .scalar()
    ) or 0

    card = KanbanCard(
        channel_id=channel_id,
        created_by_id=user.id,
        title=title[:255],
        description=(data.get("description") or "").strip(),
        column=col,
        position=max_pos + 1,
        color=data.get("color", "") if data.get("color", "") in VALID_COLORS else "",
    )
    db.session.add(card)
    db.session.commit()
    return jsonify({"card": card.to_dict()}), 201


@kanban_bp.route("/channels/<int:channel_id>/kanban/<int:card_id>", methods=["PUT"])
@login_required
def update_card(channel_id, card_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    card = KanbanCard.query.filter_by(id=card_id, channel_id=channel_id).filter(KanbanCard.deleted_at.is_(None)).first_or_404()
    data = request.get_json(silent=True) or {}

    if "title" in data:
        card.title = (data["title"] or "").strip()[:255]
    if "description" in data:
        card.description = (data["description"] or "").strip()
    if "column" in data and data["column"] in VALID_COLUMNS:
        card.column = data["column"]
    if "position" in data:
        card.position = int(data["position"])
    if "color" in data and data["color"] in VALID_COLORS:
        card.color = data["color"]

    db.session.commit()
    return jsonify({"card": card.to_dict()})


@kanban_bp.route("/channels/<int:channel_id>/kanban/<int:card_id>", methods=["DELETE"])
@login_required
def delete_card(channel_id, card_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    card = KanbanCard.query.filter_by(id=card_id, channel_id=channel_id).filter(KanbanCard.deleted_at.is_(None)).first_or_404()
    from models.models import utcnow
    card.deleted_at = utcnow()
    db.session.commit()
    return jsonify({"ok": True})
