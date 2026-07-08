import secrets
from datetime import timedelta

from models.db import db
from models.models import Organization, OrganizationMember, User, UserSettings, utcnow


VALID_MEMBER_ROLES = {"owner", "admin", "member", "developer"}
INVITE_EXPIRY_DAYS = 7


def generate_invite_token() -> tuple[str, object]:
    """Returns (token, expires_at) for a new organization invite."""
    return secrets.token_urlsafe(32), utcnow() + timedelta(days=INVITE_EXPIRY_DAYS)


def user_needs_onboarding(user: User) -> bool:
    return user.organization_id is None


def get_user_organization(user: User) -> Organization | None:
    if not user.organization_id:
        return None
    return Organization.query.get(user.organization_id)


def create_organization_with_team(
    user: User,
    workspace_name: str,
    description: str,
    members: list[dict],
) -> Organization:
    organization = Organization(
        name=workspace_name,
        description=description,
        owner_id=user.id,
    )
    db.session.add(organization)
    db.session.flush()

    user.organization_id = organization.id
    user.role = "owner"
    user.company = workspace_name

    settings = UserSettings.query.filter_by(user_id=user.id).first()
    if settings:
        settings.workspace_name = workspace_name

    db.session.add(
        OrganizationMember(
            organization_id=organization.id,
            user_id=user.id,
            email=user.email,
            name=user.name,
            role="owner",
            status="active",
        )
    )

    seen_emails = {user.email.lower()}
    for member in members:
        email = (member.get("email") or "").strip().lower()
        name = (member.get("name") or "").strip()
        role = (member.get("role") or "member").strip()

        if not email or not name or email in seen_emails:
            continue

        if role not in VALID_MEMBER_ROLES:
            role = "member"

        seen_emails.add(email)
        existing_user = User.query.filter_by(email=email).first()

        db.session.add(
            OrganizationMember(
                organization_id=organization.id,
                user_id=existing_user.id if existing_user else None,
                email=email,
                name=name,
                role=role,
                status="active" if existing_user else "invited",
                invited_by_id=user.id,
            )
        )

        if existing_user and not existing_user.organization_id:
            existing_user.organization_id = organization.id

    db.session.commit()
    return organization


def list_organization_members(organization_id: int) -> list[OrganizationMember]:
    return (
        OrganizationMember.query.filter_by(organization_id=organization_id)
        .order_by(OrganizationMember.created_at.asc())
        .all()
    )
