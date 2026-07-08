from datetime import timezone

from flask import Blueprint, jsonify, render_template, request, session

from models.db import db
from models.models import AgentConfig, Organization, OrganizationMember, User, UserSettings, utcnow
from routes.api import _validate_password
from routes.csrf import generate_csrf_token

invite_bp = Blueprint("invite", __name__)


def _find_pending_member(token: str) -> OrganizationMember | None:
    if not token:
        return None
    member = OrganizationMember.query.filter_by(invite_token=token).first()
    if not member or member.status != "invited":
        return None
    expires_at = member.invite_expires_at
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < utcnow():
            return None
    return member


@invite_bp.route("/invite/<token>")
def invite_page(token):
    member = _find_pending_member(token)
    if not member:
        return render_template("invite.html", valid=False, token=None)

    organization = Organization.query.get(member.organization_id)
    account_exists = User.query.filter_by(email=member.email).first() is not None

    return render_template(
        "invite.html",
        valid=True,
        token=token,
        organization_name=organization.name if organization else "OpenWeb",
        inviter_name=member.invited_by.name if member.invited_by else "",
        invitee_name=member.name,
        invitee_email=member.email,
        account_exists=account_exists,
    )


@invite_bp.route("/api/invite/<token>/accept", methods=["POST"])
def accept_invite(token):
    member = _find_pending_member(token)
    if not member:
        return jsonify({"error": "Приглашение недействительно или уже использовано"}), 404

    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    existing_user = User.query.filter_by(email=member.email).first()

    if existing_user:
        if not existing_user.check_password(password):
            return jsonify({"error": "Неверный пароль"}), 401
        user = existing_user
    else:
        name = (data.get("name") or member.name or "").strip()
        if not name:
            return jsonify({"error": "Укажите имя"}), 400

        pw_error = _validate_password(password)
        if pw_error:
            return jsonify({"error": pw_error}), 400

        user = User(email=member.email, name=name)
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

    if user.organization_id and user.organization_id != member.organization_id:
        return jsonify({"error": "Вы уже состоите в другой организации"}), 409

    member.user_id = user.id
    member.status = "active"
    member.invite_token = None
    member.invite_expires_at = None
    if not user.organization_id:
        user.organization_id = member.organization_id

    db.session.commit()

    session["user_id"] = user.id
    csrf_tok = generate_csrf_token()
    return jsonify({"user": user.to_dict(), "csrf_token": csrf_tok, "redirect": "/app"})
