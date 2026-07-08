from flask import Blueprint, jsonify, request, session

from models.db import db
from models.models import OrganizationMember, User, UserSettings
from routes.auth import login_required
from services.organization import (
    VALID_MEMBER_ROLES,
    create_organization_with_team,
    get_user_organization,
    list_organization_members,
    user_needs_onboarding,
)

onboarding_bp = Blueprint("onboarding", __name__, url_prefix="/api/onboarding")


def member_to_dict(member: OrganizationMember) -> dict:
    data = member.to_dict()
    if member.user_id:
        settings = UserSettings.query.filter_by(user_id=member.user_id).first()
        data["avatar_url"] = settings.avatar_url if settings else ""
    else:
        data["avatar_url"] = ""
    return data


@onboarding_bp.route("/status")
@login_required
def onboarding_status():
    user = User.query.get_or_404(session["user_id"])
    organization = get_user_organization(user)

    return jsonify(
        {
            "required": user_needs_onboarding(user),
            "organization": organization.to_dict() if organization else None,
        }
    )


@onboarding_bp.route("/setup", methods=["POST"])
@login_required
def setup_workspace():
    user = User.query.get_or_404(session["user_id"])

    if not user_needs_onboarding(user):
        return jsonify({"error": "Workspace уже создан"}), 409

    data = request.get_json(silent=True) or {}
    workspace_name = (data.get("workspace_name") or "").strip()
    description = (data.get("description") or "").strip()
    members = data.get("members") or []

    if not workspace_name:
        return jsonify({"error": "Укажите название workspace"}), 400

    if not isinstance(members, list):
        return jsonify({"error": "Некорректный список участников"}), 400

    for member in members:
        role = (member.get("role") or "member").strip()
        if role not in VALID_MEMBER_ROLES:
            return jsonify({"error": f"Недопустимая роль: {role}"}), 400

    organization = create_organization_with_team(
        user=user,
        workspace_name=workspace_name,
        description=description,
        members=members,
    )

    team = list_organization_members(organization.id)
    return jsonify(
        {
            "organization": organization.to_dict(),
            "members": [member_to_dict(member) for member in team],
            "user": user.to_dict(),
        }
    )


org_bp = Blueprint("organization", __name__, url_prefix="/api/organization")


@org_bp.route("/members")
@login_required
def organization_members():
    user = User.query.get_or_404(session["user_id"])
    if not user.organization_id:
        return jsonify({"members": []})

    team = list_organization_members(user.organization_id)
    return jsonify({"members": [member_to_dict(member) for member in team]})


@org_bp.route("/members", methods=["POST"])
@login_required
def add_organization_member():
    user = User.query.get_or_404(session["user_id"])
    if not user.organization_id:
        return jsonify({"error": "Сначала создайте workspace"}), 400

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip()
    role = (data.get("role") or "member").strip()

    if not email or not name:
        return jsonify({"error": "Укажите имя и email"}), 400

    if role not in VALID_MEMBER_ROLES - {"owner"}:
        return jsonify({"error": "Недопустимая роль"}), 400

    existing = OrganizationMember.query.filter_by(
        organization_id=user.organization_id,
        email=email,
    ).first()
    if existing:
        return jsonify({"error": "Участник с таким email уже добавлен"}), 409

    linked_user = User.query.filter_by(email=email).first()
    member = OrganizationMember(
        organization_id=user.organization_id,
        user_id=linked_user.id if linked_user else None,
        email=email,
        name=name,
        role=role,
        status="active" if linked_user else "invited",
        invited_by_id=user.id,
    )
    db.session.add(member)

    if linked_user and not linked_user.organization_id:
        linked_user.organization_id = user.organization_id

    db.session.commit()
    return jsonify({"member": member_to_dict(member)})
