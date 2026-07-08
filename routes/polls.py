import json

from flask import Blueprint, jsonify, request, session

from models.db import db
from models.models import Channel, Message, Poll, PollVote, User
from routes.auth import login_required
from services.channels import user_can_access_channel

polls_bp = Blueprint("polls", __name__, url_prefix="/api")


@polls_bp.route("/channels/<int:channel_id>/polls", methods=["POST"])
@login_required
def create_poll(channel_id):
    user = User.query.get_or_404(session["user_id"])
    channel = Channel.query.get_or_404(channel_id)
    if not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    options = data.get("options") or []

    if not question:
        return jsonify({"error": "Укажите вопрос"}), 400
    if len(options) < 2:
        return jsonify({"error": "Нужно минимум 2 варианта"}), 400
    if len(options) > 10:
        return jsonify({"error": "Максимум 10 вариантов"}), 400

    options = [str(o).strip()[:200] for o in options if str(o).strip()]

    poll = Poll(
        channel_id=channel_id,
        created_by_id=user.id,
        question=question[:500],
        options_json=json.dumps(options, ensure_ascii=False),
    )
    db.session.add(poll)
    db.session.flush()

    message = Message(
        channel_id=channel_id,
        user_id=user.id,
        content=f"📊 {question}",
        poll_id=poll.id,
    )
    db.session.add(message)
    db.session.flush()
    poll.message_id = message.id
    db.session.commit()

    return jsonify({"poll": poll.to_dict(current_user_id=user.id), "message": message.to_dict(current_user_id=user.id)}), 201


@polls_bp.route("/polls/<int:poll_id>/vote", methods=["POST"])
@login_required
def vote(poll_id):
    user_id = session["user_id"]
    data = request.get_json(silent=True) or {}
    option_index = data.get("option_index")

    poll = Poll.query.get_or_404(poll_id)
    user = User.query.get_or_404(user_id)
    channel = Channel.query.get(poll.channel_id)
    if not channel or not user_can_access_channel(user, channel):
        return jsonify({"error": "Нет доступа"}), 403

    opts = poll.options()
    if option_index is None or not (0 <= int(option_index) < len(opts)):
        return jsonify({"error": "Недопустимый вариант"}), 400

    existing = PollVote.query.filter_by(poll_id=poll_id, user_id=user_id).first()
    if existing:
        existing.option_index = int(option_index)
    else:
        db.session.add(PollVote(poll_id=poll_id, user_id=user_id, option_index=int(option_index)))
    db.session.commit()
    db.session.refresh(poll)
    return jsonify({"poll": poll.to_dict(current_user_id=user_id)})
