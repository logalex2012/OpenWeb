from models.db import db
from models.models import Notification, User


def _valid_mention_ids(mention_ids: list, organization_id: int, exclude_user_id: int) -> list[int]:
    if not mention_ids or not organization_id:
        return []

    try:
        candidate_ids = {int(m) for m in mention_ids}
    except (TypeError, ValueError):
        return []

    candidate_ids.discard(exclude_user_id)
    if not candidate_ids:
        return []

    return [
        row.id
        for row in User.query.filter(
            User.id.in_(candidate_ids), User.organization_id == organization_id
        ).all()
    ]


def notify_mentions(mention_ids: list, actor: User, channel_id: int, message_id: int, preview: str) -> None:
    for recipient_id in _valid_mention_ids(mention_ids, actor.organization_id, actor.id):
        db.session.add(
            Notification(
                user_id=recipient_id,
                actor_id=actor.id,
                type="mention",
                channel_id=channel_id,
                message_id=message_id,
                preview=preview[:280],
            )
        )


def notify_thread_reply(parent_author_id: int | None, actor: User, channel_id: int, message_id: int, preview: str) -> None:
    if not parent_author_id or parent_author_id == actor.id:
        return

    db.session.add(
        Notification(
            user_id=parent_author_id,
            actor_id=actor.id,
            type="thread_reply",
            channel_id=channel_id,
            message_id=message_id,
            preview=preview[:280],
        )
    )


def notify_kanban_assignment(assignee_id: int | None, actor: User, channel_id: int, card_id: int, preview: str) -> None:
    if not assignee_id or assignee_id == actor.id:
        return
    if not User.query.filter_by(id=assignee_id, organization_id=actor.organization_id).first():
        return

    db.session.add(
        Notification(
            user_id=assignee_id,
            actor_id=actor.id,
            type="kanban_assigned",
            channel_id=channel_id,
            card_id=card_id,
            preview=preview[:280],
        )
    )
