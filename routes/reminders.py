from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, session

from models.db import db
from models.models import Message, Reminder, User
from routes.auth import login_required

reminders_bp = Blueprint("reminders", __name__, url_prefix="/api/reminders")


def _parse_remind_at(when: str) -> datetime | None:
    now = datetime.now(timezone.utc)
    mapping = {
        "1h": now + timedelta(hours=1),
        "3h": now + timedelta(hours=3),
        "tomorrow": (now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0),
        "week": (now + timedelta(weeks=1)).replace(hour=9, minute=0, second=0, microsecond=0),
    }
    return mapping.get(when)


@reminders_bp.route("", methods=["POST"])
@login_required
def create_reminder():
    user_id = session["user_id"]
    data = request.get_json(silent=True) or {}
    message_id = data.get("message_id")
    when = data.get("when", "1h")

    remind_at = _parse_remind_at(when)
    if not remind_at:
        return jsonify({"error": "Неверный интервал"}), 400

    preview = ""
    channel_id = None
    if message_id:
        msg = Message.query.get(message_id)
        if msg:
            preview = msg.content[:200]
            channel_id = msg.channel_id

    reminder = Reminder(
        user_id=user_id,
        message_id=message_id,
        channel_id=channel_id,
        message_preview=preview,
        remind_at=remind_at,
    )
    db.session.add(reminder)
    db.session.commit()
    return jsonify({"reminder": reminder.to_dict()}), 201


@reminders_bp.route("")
@login_required
def list_reminders():
    user_id = session["user_id"]
    reminders = (
        Reminder.query.filter_by(user_id=user_id, sent=False)
        .order_by(Reminder.remind_at.asc())
        .all()
    )
    return jsonify({"reminders": [r.to_dict() for r in reminders]})


@reminders_bp.route("/due")
@login_required
def due_reminders():
    user_id = session["user_id"]
    now = datetime.now(timezone.utc)
    due = (
        Reminder.query
        .filter_by(user_id=user_id, sent=False)
        .filter(Reminder.remind_at <= now)
        .all()
    )
    for r in due:
        r.sent = True
    if due:
        db.session.commit()
    return jsonify({"reminders": [r.to_dict() for r in due]})


@reminders_bp.route("/<int:reminder_id>", methods=["DELETE"])
@login_required
def delete_reminder(reminder_id):
    user_id = session["user_id"]
    reminder = Reminder.query.filter_by(id=reminder_id, user_id=user_id).first_or_404()
    db.session.delete(reminder)
    db.session.commit()
    return jsonify({"ok": True})
