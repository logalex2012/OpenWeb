import re

from models.db import db
from models.models import Channel, ChannelCategory, Message, Organization, User

ALLOWED_ICONS = {
    "#", "💬", "📢", "🎮", "💼", "⚙️", "🤖", "📝", "🚀", "📱", "🎨", "🔥", "⭐",
    "🔔", "📊", "🛠️", "💡", "🎯", "📌", "🗂️", "👥", "🔒", "🌐", "📎", "✅", "❓",
}

CYRILLIC_MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}


def normalize_icon(icon: str | None) -> str:
    value = (icon or "#").strip()
    if value in ALLOWED_ICONS:
        return value
    return "#"


def slugify_name(name: str) -> str:
    text = name.strip().lower()
    result = []
    for char in text:
        if char in CYRILLIC_MAP:
            result.append(CYRILLIC_MAP[char])
        elif char.isalnum():
            result.append(char)
        elif char in {" ", "-", "_"}:
            result.append("-")
    slug = re.sub(r"-+", "-", "".join(result)).strip("-")
    return (slug or "channel")[:80]


def unique_slug(name: str, organization_id: int) -> str:
    base = slugify_name(name)
    slug = base
    counter = 1
    while Channel.query.filter_by(organization_id=organization_id, slug=slug).first():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def get_organization_channels_payload(organization_id: int) -> dict:
    categories = (
        ChannelCategory.query.filter_by(organization_id=organization_id)
        .order_by(ChannelCategory.position.asc(), ChannelCategory.id.asc())
        .all()
    )
    channels = (
        Channel.query.filter_by(organization_id=organization_id)
        .order_by(Channel.position.asc(), Channel.id.asc())
        .all()
    )
    return {
        "categories": [category.to_dict() for category in categories],
        "channels": [channel.to_dict() for channel in channels],
    }


def user_can_access_channel(user: User, channel: Channel) -> bool:
    if not user.organization_id or channel.organization_id != user.organization_id:
        return False
    return True


def create_category(organization_id: int, name: str) -> ChannelCategory:
    max_position = (
        db.session.query(db.func.max(ChannelCategory.position))
        .filter_by(organization_id=organization_id)
        .scalar()
    ) or 0
    category = ChannelCategory(
        organization_id=organization_id,
        name=name.strip()[:120],
        position=max_position + 1,
    )
    db.session.add(category)
    db.session.commit()
    return category


def create_channel(
    organization_id: int,
    user_id: int,
    name: str,
    *,
    icon: str = "#",
    description: str = "",
    category_id: int | None = None,
    channel_type: str = "text",
) -> Channel:
    if category_id:
        category = ChannelCategory.query.filter_by(
            id=category_id,
            organization_id=organization_id,
        ).first()
        if not category:
            raise ValueError("Раздел не найден")

    max_position = (
        db.session.query(db.func.max(Channel.position))
        .filter_by(organization_id=organization_id, category_id=category_id)
        .scalar()
    ) or 0

    channel = Channel(
        organization_id=organization_id,
        category_id=category_id,
        name=name.strip()[:120],
        slug=unique_slug(name, organization_id),
        description=(description or "").strip(),
        channel_type=channel_type,
        icon=normalize_icon(icon),
        position=max_position + 1,
        created_by_id=user_id,
    )
    db.session.add(channel)
    db.session.commit()
    return channel


def migrate_legacy_channels() -> None:
    """Assign global seed channels to the demo organization."""
    legacy = Channel.query.filter(Channel.organization_id.is_(None)).all()
    if not legacy:
        return

    demo_org = Organization.query.filter_by(name="OpenWeb").first()
    if not demo_org:
        demo_org = Organization.query.order_by(Organization.id.asc()).first()
    if not demo_org:
        return

    category = ChannelCategory.query.filter_by(
        organization_id=demo_org.id,
        name="Текстовые каналы",
    ).first()
    if not category:
        category = ChannelCategory(
            organization_id=demo_org.id,
            name="Текстовые каналы",
            position=0,
        )
        db.session.add(category)
        db.session.flush()

    for index, channel in enumerate(legacy):
        channel.organization_id = demo_org.id
        channel.category_id = category.id
        channel.position = index

    db.session.commit()
