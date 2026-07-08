from models.models import AgentConfig, UserSettings


def get_or_create_user_settings(user_id: int) -> UserSettings:
    settings = UserSettings.query.filter_by(user_id=user_id).first()
    if settings:
        return settings

    settings = UserSettings(user_id=user_id)
    from models.db import db

    db.session.add(settings)
    db.session.commit()
    return settings


def get_or_create_agent_config(user_id: int) -> AgentConfig:
    config = AgentConfig.query.filter_by(user_id=user_id).first()
    if config:
        return config

    config = AgentConfig(user_id=user_id)
    from models.db import db

    db.session.add(config)
    db.session.commit()
    return config
