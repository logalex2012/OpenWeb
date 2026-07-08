from flask import Blueprint, jsonify, session

from models.db import db
from models.models import Notification
from routes.auth import login_required

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.route("")
@login_required
def list_notifications():
    user_id = session["user_id"]
    notifications = (
        Notification.query.filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()

    return jsonify(
        {
            "notifications": [n.to_dict() for n in notifications],
            "unread_count": unread_count,
        }
    )


@notifications_bp.route("/<int:notification_id>/read", methods=["POST"])
@login_required
def mark_notification_read(notification_id):
    user_id = session["user_id"]
    notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first_or_404()
    notification.is_read = True
    db.session.commit()
    return jsonify({"ok": True})


@notifications_bp.route("/read-all", methods=["POST"])
@login_required
def mark_all_notifications_read():
    user_id = session["user_id"]
    Notification.query.filter_by(user_id=user_id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"ok": True})
