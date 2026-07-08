from flask import Blueprint, jsonify, request, session

from models.db import db
from models.models import Channel, KanbanCard, User
from routes.auth import login_required
from services.channels import user_can_access_channel
from services.notifications import notify_kanban_assignment

kanban_bp = Blueprint("kanban", __name__, url_prefix="/api")

VALID_COLUMNS = {"todo", "progress", "done"}
VALID_COLORS = {"", "red", "green", "blue", "yellow", "purple", "orange"}


def _resolve_assignee_id(data: dict, organization_id: int | None) -> tuple[int | None, str | None]:
    if "assignee_id" not in data:
        return None, None

    raw = data.get("assignee_id")
    if raw in (None, "", 0):
        return None, "clear"

    try:
        assignee_id = int(raw)
    except (TypeError, ValueError):
        return None, "invalid"

    if not User.query.filter_by(id=assignee_id, organization_id=organization_id).first():
        return None, "invalid"

    return assignee_id, "set"


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

    assignee_id, assignee_mode = _resolve_assignee_id(data, user.organization_id)
    if assignee_mode == "invalid":
        return jsonify({"error": "Участник не найден в организации"}), 400

    max_pos = (
        db.session.query(db.func.max(KanbanCard.position))
        .filter_by(channel_id=channel_id, column=col)
        .filter(KanbanCard.deleted_at.is_(None))
        .scalar()
    ) or 0

    card = KanbanCard(
        channel_id=channel_id,
        created_by_id=user.id,
        assignee_id=assignee_id,
        title=title[:255],
        description=(data.get("description") or "").strip(),
        column=col,
        position=max_pos + 1,
        color=data.get("color", "") if data.get("color", "") in VALID_COLORS else "",
    )
    db.session.add(card)
    db.session.flush()

    notify_kanban_assignment(assignee_id, user, channel_id, card.id, card.title)

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

    if "assignee_id" in data:
        assignee_id, assignee_mode = _resolve_assignee_id(data, user.organization_id)
        if assignee_mode == "invalid":
            return jsonify({"error": "Участник не найден в организации"}), 400
        if assignee_id != card.assignee_id:
            card.assignee_id = assignee_id
            notify_kanban_assignment(assignee_id, user, channel_id, card.id, card.title)

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
