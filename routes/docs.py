from flask import Blueprint, jsonify, request, session

from models.db import db
from models.models import Page, User
from routes.auth import login_required

docs_bp = Blueprint("docs", __name__, url_prefix="/api/docs")

ALLOWED_ICONS = {"📄", "📝", "📋", "🗒️", "📌", "💡", "🎯", "🔖", "📊", "🗂️", "⭐", "✅", "🚀", "💼", "🔒"}


@docs_bp.route("")
@login_required
def list_pages():
    user = User.query.get_or_404(session["user_id"])
    if not user.organization_id:
        return jsonify({"pages": []})

    channel_id = request.args.get("channel_id")
    query = Page.query.filter_by(
        organization_id=user.organization_id
    ).filter(Page.deleted_at.is_(None))

    if channel_id:
        query = query.filter_by(channel_id=int(channel_id))

    pages = query.order_by(Page.updated_at.desc()).limit(100).all()
    return jsonify({"pages": [p.to_dict() for p in pages]})


@docs_bp.route("", methods=["POST"])
@login_required
def create_page():
    user = User.query.get_or_404(session["user_id"])
    if not user.organization_id:
        return jsonify({"error": "Сначала создайте workspace"}), 400

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Укажите заголовок страницы"}), 400

    icon = (data.get("icon") or "📄").strip()
    if icon not in ALLOWED_ICONS:
        icon = "📄"

    channel_id = data.get("channel_id")

    page = Page(
        organization_id=user.organization_id,
        channel_id=int(channel_id) if channel_id else None,
        created_by_id=user.id,
        title=title[:255],
        content=data.get("content") or "",
        icon=icon,
    )
    db.session.add(page)
    db.session.commit()
    return jsonify({"page": page.to_dict()}), 201


@docs_bp.route("/<int:page_id>")
@login_required
def get_page(page_id):
    user = User.query.get_or_404(session["user_id"])
    page = Page.query.filter_by(id=page_id).filter(Page.deleted_at.is_(None)).first_or_404()
    if page.organization_id != user.organization_id:
        return jsonify({"error": "Нет доступа"}), 403
    return jsonify({"page": page.to_dict()})


@docs_bp.route("/<int:page_id>", methods=["PUT"])
@login_required
def update_page(page_id):
    user = User.query.get_or_404(session["user_id"])
    page = Page.query.filter_by(id=page_id).filter(Page.deleted_at.is_(None)).first_or_404()
    if page.organization_id != user.organization_id:
        return jsonify({"error": "Нет доступа"}), 403

    data = request.get_json(silent=True) or {}

    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            return jsonify({"error": "Укажите заголовок"}), 400
        page.title = title[:255]

    if "content" in data:
        page.content = data["content"] or ""

    if "icon" in data:
        icon = (data["icon"] or "📄").strip()
        page.icon = icon if icon in ALLOWED_ICONS else "📄"

    db.session.commit()
    return jsonify({"page": page.to_dict()})


@docs_bp.route("/<int:page_id>", methods=["DELETE"])
@login_required
def delete_page(page_id):
    user = User.query.get_or_404(session["user_id"])
    page = Page.query.filter_by(id=page_id).filter(Page.deleted_at.is_(None)).first_or_404()
    if page.organization_id != user.organization_id:
        return jsonify({"error": "Нет доступа"}), 403

    from models.models import utcnow
    page.deleted_at = utcnow()
    db.session.commit()
    return jsonify({"ok": True})
