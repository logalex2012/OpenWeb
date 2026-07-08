from models.db import db
from models.models import AgentConfig, Channel, Message, Organization, OrganizationMember, User, UserSettings


DEFAULT_CHANNELS = [
    {
        "name": "общее",
        "slug": "general",
        "description": "Общие обсуждения команды",
        "channel_type": "text",
        "icon": "#",
    },
    {
        "name": "разработка",
        "slug": "dev",
        "description": "Беседа с разработчиками",
        "channel_type": "text",
        "icon": "⚙",
    },
    {
        "name": "бизнес",
        "slug": "business",
        "description": "Задачи и сообщения для бизнеса",
        "channel_type": "text",
        "icon": "💼",
    },
    {
        "name": "агент",
        "slug": "agent",
        "description": "Поручения AI-агенту",
        "channel_type": "agent",
        "icon": "🤖",
    },
]


WELCOME_MESSAGES = {
    "general": "Добро пожаловать в OpenWeb! Здесь команда делится идеями и новостями.",
    "dev": "Канал для разработчиков: обсуждайте задачи, релизы и технические вопросы.",
    "business": "Бизнес-канал: отправляйте запросы, согласовывайте решения с командой.",
    "agent": "Поручайте агенту задачи — например: «Настроим пост для Telegram и X о запуске продукта».",
}


def seed_database() -> None:
    if Channel.query.count() > 0:
        return

    for channel_data in DEFAULT_CHANNELS:
        channel = Channel(**channel_data)
        db.session.add(channel)

    db.session.flush()

    for slug, text in WELCOME_MESSAGES.items():
        channel = Channel.query.filter_by(slug=slug).first()
        if channel:
            db.session.add(
                Message(
                    channel_id=channel.id,
                    user_id=None,
                    content=text,
                    is_agent=True,
                )
            )

    demo_user = User(
        email="demo@openweb.ru",
        name="Демо-пользователь",
        company="OpenWeb",
        role="owner",
    )
    demo_user.set_password("demo1234")
    db.session.add(demo_user)
    db.session.flush()

    demo_org = Organization(
        name="OpenWeb",
        description="Демо-организация для знакомства с платформой",
        owner_id=demo_user.id,
    )
    db.session.add(demo_org)
    db.session.flush()

    demo_user.organization_id = demo_org.id

    db.session.add(
        OrganizationMember(
            organization_id=demo_org.id,
            user_id=demo_user.id,
            email=demo_user.email,
            name=demo_user.name,
            role="owner",
            status="active",
        )
    )

    db.session.add(
        AgentConfig(
            user_id=demo_user.id,
            name="OpenWeb AI",
            tone="professional",
            platforms="telegram,x,vk",
            enabled=True,
        )
    )

    db.session.add(
        UserSettings(
            user_id=demo_user.id,
            workspace_name="OpenWeb",
            job_title="Администратор",
            status_message="Настраиваю рабочее пространство",
            theme="light",
            compact_mode=False,
            notifications=True,
            default_channel_slug="general",
        )
    )

    db.session.commit()


def ensure_demo_organization() -> None:
    demo_user = User.query.filter_by(email="demo@openweb.ru").first()
    if not demo_user or demo_user.organization_id:
        return

    demo_org = Organization(
        name="OpenWeb",
        description="Демо-организация для знакомства с платформой",
        owner_id=demo_user.id,
    )
    db.session.add(demo_org)
    db.session.flush()

    demo_user.organization_id = demo_org.id
    demo_user.role = "owner"

    db.session.add(
        OrganizationMember(
            organization_id=demo_org.id,
            user_id=demo_user.id,
            email=demo_user.email,
            name=demo_user.name,
            role="owner",
            status="active",
        )
    )

    db.session.commit()
