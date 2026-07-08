from sqlalchemy import inspect, text

from models.db import db


def run_migrations() -> None:
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()

    if "users" in tables:
        user_columns = {col["name"] for col in inspector.get_columns("users")}
        if "organization_id" not in user_columns:
            db.session.execute(text("ALTER TABLE users ADD COLUMN organization_id INTEGER"))
            db.session.commit()

    if "channels" in tables:
        channel_columns = {col["name"] for col in inspector.get_columns("channels")}
        if "organization_id" not in channel_columns:
            db.session.execute(text("ALTER TABLE channels ADD COLUMN organization_id INTEGER"))
        if "category_id" not in channel_columns:
            db.session.execute(text("ALTER TABLE channels ADD COLUMN category_id INTEGER"))
        if "position" not in channel_columns:
            db.session.execute(text("ALTER TABLE channels ADD COLUMN position INTEGER DEFAULT 0"))
        if "created_by_id" not in channel_columns:
            db.session.execute(text("ALTER TABLE channels ADD COLUMN created_by_id INTEGER"))
        db.session.execute(
            text("ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_slug_key")
        )
        db.session.commit()

    if "user_settings" in tables:
        settings_columns = {col["name"] for col in inspector.get_columns("user_settings")}
        if "avatar_url" not in settings_columns:
            db.session.execute(text("ALTER TABLE user_settings ADD COLUMN avatar_url VARCHAR(512)"))
            db.session.commit()

    if "messages" in tables:
        msg_columns = {col["name"] for col in inspector.get_columns("messages")}
        if "deleted_at" not in msg_columns:
            db.session.execute(text("ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMP"))
        if "is_pinned" not in msg_columns:
            db.session.execute(text("ALTER TABLE messages ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE"))
        if "attachment_id" not in msg_columns:
            db.session.execute(text("ALTER TABLE messages ADD COLUMN attachment_id INTEGER"))
        db.session.commit()

    # messages.parent_id and poll_id
    if "messages" in tables:
        msg_cols = {col["name"] for col in inspector.get_columns("messages")}
        if "parent_id" not in msg_cols:
            db.session.execute(text("ALTER TABLE messages ADD COLUMN parent_id INTEGER"))
        if "poll_id" not in msg_cols:
            db.session.execute(text("ALTER TABLE messages ADD COLUMN poll_id INTEGER"))
        db.session.commit()

    cleanup_test_members()


def cleanup_test_members() -> None:
    from models.models import OrganizationMember

    test_emails = ["maria@openweb.ru", "alex@openweb.ru", "elena@openweb.ru"]
    OrganizationMember.query.filter(OrganizationMember.email.in_(test_emails)).delete(
        synchronize_session=False
    )
    db.session.commit()


def migrate_channel_data() -> None:
    from services.channels import migrate_legacy_channels

    migrate_legacy_channels()
