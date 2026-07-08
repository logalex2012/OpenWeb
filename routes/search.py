from flask import Blueprint, jsonify, request, session

from models.models import Channel, Message, Page, User
from routes.auth import login_required
from services.channels import user_can_access_channel

search_bp = Blueprint("search", __name__, url_prefix="/api")


@search_bp.route("/search")
@login_required
def global_search():
    user = User.query.get_or_404(session["user_id"])
    if not user.organization_id:
        return jsonify({"messages": [], "pages": []})

    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"messages": [], "pages": []})

    pattern = f"%{q}%"

    # Get user's channels
    from models.models import Channel as Ch
    org_channels = Ch.query.filter_by(organization_id=user.organization_id).all()
    accessible_ids = [c.id for c in org_channels if user_can_access_channel(user, c)]

    messages = (
        Message.query
        .filter(Message.channel_id.in_(accessible_ids))
        .filter(Message.content.ilike(pattern))
        .filter(Message.deleted_at.is_(None))
        .order_by(Message.created_at.desc())
        .limit(20)
        .all()
    )

    pages = (
        Page.query
        .filter_by(organization_id=user.organization_id)
        .filter(Page.deleted_at.is_(None))
        .filter((Page.title.ilike(pattern)) | (Page.content.ilike(pattern)))
        .order_by(Page.updated_at.desc())
        .limit(10)
        .all()
    )

    channel_map = {c.id: c for c in org_channels}

    return jsonify({
        "messages": [
            {
                **m.to_dict(current_user_id=user.id),
                "channel_name": channel_map.get(m.channel_id, {}).name if m.channel_id in channel_map else "",
                "channel_icon": channel_map.get(m.channel_id, {}).icon if m.channel_id in channel_map else "#",
            }
            for m in messages
        ],
        "pages": [p.to_dict() for p in pages],
    })
