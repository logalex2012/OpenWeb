import secrets
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from models.db import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    company = db.Column(db.String(120))
    role = db.Column(db.String(32), default="member")
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"))
    created_at = db.Column(db.DateTime, default=utcnow)

    messages = db.relationship("Message", back_populates="author", lazy="dynamic")
    agent_configs = db.relationship("AgentConfig", back_populates="owner", lazy="dynamic")
    agent_tasks = db.relationship("AgentTask", back_populates="owner", lazy="dynamic")
    settings = db.relationship("UserSettings", back_populates="owner", uselist=False)
    organization = db.relationship("Organization", back_populates="members", foreign_keys=[organization_id])
    memberships = db.relationship(
        "OrganizationMember",
        back_populates="user",
        foreign_keys="OrganizationMember.user_id",
        lazy="dynamic",
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "company": self.company,
            "role": self.role,
            "organization_id": self.organization_id,
        }


class Organization(db.Model):
    __tablename__ = "organizations"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    owner = db.relationship("User", foreign_keys=[owner_id])
    members = db.relationship("User", back_populates="organization", foreign_keys=[User.organization_id])
    team = db.relationship(
        "OrganizationMember",
        back_populates="organization",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )
    channel_categories = db.relationship(
        "ChannelCategory",
        back_populates="organization",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="ChannelCategory.position",
    )
    channels = db.relationship(
        "Channel",
        back_populates="organization",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="Channel.position",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description or "",
            "owner_id": self.owner_id,
            "members_count": self.team.count(),
        }


class OrganizationMember(db.Model):
    __tablename__ = "organization_members"

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    email = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(32), default="member")
    status = db.Column(db.String(32), default="invited")
    invited_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow)

    organization = db.relationship("Organization", back_populates="team")
    user = db.relationship("User", foreign_keys=[user_id], back_populates="memberships")
    invited_by = db.relationship("User", foreign_keys=[invited_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "status": self.status,
            "user_id": self.user_id,
        }


class UserSettings(db.Model):
    __tablename__ = "user_settings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    workspace_name = db.Column(db.String(120), default="OpenWeb")
    job_title = db.Column(db.String(120))
    status_message = db.Column(db.String(255))
    theme = db.Column(db.String(16), default="light")
    compact_mode = db.Column(db.Boolean, default=False)
    notifications = db.Column(db.Boolean, default=True)
    default_channel_slug = db.Column(db.String(120), default="general")
    avatar_url = db.Column(db.String(512))
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    owner = db.relationship("User", back_populates="settings")

    def to_dict(self):
        return {
            "workspace_name": self.workspace_name,
            "job_title": self.job_title or "",
            "status_message": self.status_message or "",
            "theme": self.theme,
            "compact_mode": self.compact_mode,
            "notifications": self.notifications,
            "default_channel_slug": self.default_channel_slug,
            "avatar_url": self.avatar_url or "",
        }


class ChannelCategory(db.Model):
    __tablename__ = "channel_categories"

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utcnow)

    organization = db.relationship("Organization", back_populates="channel_categories")
    channels = db.relationship(
        "Channel",
        back_populates="category",
        lazy="dynamic",
        order_by="Channel.position",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "organization_id": self.organization_id,
            "name": self.name,
            "position": self.position,
        }


class Channel(db.Model):
    __tablename__ = "channels"
    __table_args__ = (
        db.UniqueConstraint("organization_id", "slug", name="uq_channel_org_slug"),
    )

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("channel_categories.id"), index=True)
    name = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(120), nullable=False, index=True)
    description = db.Column(db.Text)
    channel_type = db.Column(db.String(32), default="text")
    icon = db.Column(db.String(16), default="#")
    position = db.Column(db.Integer, default=0)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow)

    organization = db.relationship("Organization", back_populates="channels")
    category = db.relationship("ChannelCategory", back_populates="channels")
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    messages = db.relationship(
        "Message",
        back_populates="channel",
        lazy="dynamic",
        order_by="Message.created_at",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "organization_id": self.organization_id,
            "category_id": self.category_id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description or "",
            "channel_type": self.channel_type,
            "icon": self.icon or "#",
            "position": self.position,
        }


class Attachment(db.Model):
    __tablename__ = "attachments"

    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(512), nullable=False)
    size = db.Column(db.Integer, nullable=False)
    mime_type = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=utcnow)

    uploader = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "original_name": self.original_name,
            "url": self.url,
            "size": self.size,
            "mime_type": self.mime_type or "",
        }


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    content = db.Column(db.Text, nullable=False)
    is_agent = db.Column(db.Boolean, default=False)
    is_pinned = db.Column(db.Boolean, default=False)
    attachment_id = db.Column(db.Integer, db.ForeignKey("attachments.id"))
    deleted_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)
    parent_id = db.Column(db.Integer, db.ForeignKey("messages.id"))
    poll_id = db.Column(db.Integer, db.ForeignKey("polls.id"))
    replies = db.relationship("Message", backref=db.backref("parent", remote_side="Message.id"), lazy="dynamic", foreign_keys="Message.parent_id")
    poll = db.relationship("Poll", foreign_keys="[Message.poll_id]")

    channel = db.relationship("Channel", back_populates="messages")
    author = db.relationship("User", back_populates="messages")
    attachment = db.relationship("Attachment")
    reactions = db.relationship(
        "MessageReaction",
        back_populates="message",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self, current_user_id=None):
        avatar_url = ""
        if self.author and self.author.settings:
            avatar_url = self.author.settings.avatar_url or ""

        reactions_grouped = {}
        for reaction in self.reactions:
            emoji = reaction.emoji
            if emoji not in reactions_grouped:
                reactions_grouped[emoji] = {"emoji": emoji, "count": 0, "mine": False}
            reactions_grouped[emoji]["count"] += 1
            if current_user_id and reaction.user_id == current_user_id:
                reactions_grouped[emoji]["mine"] = True

        return {
            "id": self.id,
            "channel_id": self.channel_id,
            "user_id": self.user_id,
            "author_name": self.author.name if self.author else "OpenWeb Agent",
            "author_avatar_url": avatar_url,
            "content": self.content,
            "is_agent": self.is_agent,
            "is_pinned": self.is_pinned,
            "attachment": self.attachment.to_dict() if self.attachment else None,
            "reactions": list(reactions_grouped.values()),
            "created_at": self.created_at.isoformat(),
            "parent_id": self.parent_id,
            "reply_count": self.replies.filter(Message.deleted_at.is_(None)).count(),
            "poll": self.poll.to_dict(current_user_id=current_user_id) if self.poll else None,
        }


class MessageReaction(db.Model):
    __tablename__ = "message_reactions"
    __table_args__ = (
        db.UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction"),
    )

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    emoji = db.Column(db.String(16), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    message = db.relationship("Message", back_populates="reactions")
    user = db.relationship("User")


class Page(db.Model):
    __tablename__ = "pages"

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"))
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, default="")
    icon = db.Column(db.String(8), default="📄")
    deleted_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    organization = db.relationship("Organization")
    channel = db.relationship("Channel")
    created_by = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "organization_id": self.organization_id,
            "channel_id": self.channel_id,
            "title": self.title,
            "content": self.content or "",
            "icon": self.icon or "📄",
            "created_by_name": self.created_by.name if self.created_by else "",
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else self.created_at.isoformat(),
        }


class CallRoom(db.Model):
    __tablename__ = "call_rooms"

    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"), nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.String(64), nullable=False, unique=True)
    ended_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow)

    channel = db.relationship("Channel")
    created_by = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "channel_id": self.channel_id,
            "token": self.token,
            "jitsi_url": f"https://meet.jit.si/openweb-{self.token}",
            "created_by_name": self.created_by.name if self.created_by else "",
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "created_at": self.created_at.isoformat(),
        }


class AgentConfig(db.Model):
    __tablename__ = "agent_configs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(120), default="OpenWeb Agent")
    tone = db.Column(db.String(32), default="professional")
    platforms = db.Column(db.String(255), default="telegram,x,vk")
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    owner = db.relationship("User", back_populates="agent_configs")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "tone": self.tone,
            "platforms": self.platforms.split(",") if self.platforms else [],
            "enabled": self.enabled,
        }


class AgentTask(db.Model):
    __tablename__ = "agent_tasks"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"))
    prompt = db.Column(db.Text, nullable=False)
    response = db.Column(db.Text)
    status = db.Column(db.String(32), default="completed")
    created_at = db.Column(db.DateTime, default=utcnow)

    owner = db.relationship("User", back_populates="agent_tasks")
    channel = db.relationship("Channel")

    def to_dict(self):
        return {
            "id": self.id,
            "prompt": self.prompt,
            "response": self.response,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }


class PinnedChannel(db.Model):
    __tablename__ = "pinned_channels"
    __table_args__ = (db.UniqueConstraint("user_id", "channel_id", name="uq_pinned"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"), nullable=False)
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utcnow)

    user = db.relationship("User")
    channel = db.relationship("Channel")


class KanbanCard(db.Model):
    __tablename__ = "kanban_cards"

    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"), nullable=False, index=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default="")
    column = db.Column(db.String(32), default="todo")  # todo | progress | done
    position = db.Column(db.Integer, default=0)
    color = db.Column(db.String(16), default="")
    deleted_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    channel = db.relationship("Channel")
    created_by = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "channel_id": self.channel_id,
            "title": self.title,
            "description": self.description or "",
            "column": self.column,
            "position": self.position,
            "color": self.color or "",
            "created_by_name": self.created_by.name if self.created_by else "",
            "created_at": self.created_at.isoformat(),
        }


class Poll(db.Model):
    __tablename__ = "polls"

    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"), nullable=False)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id"))
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    question = db.Column(db.String(500), nullable=False)
    options_json = db.Column(db.Text, nullable=False)  # JSON array of strings
    created_at = db.Column(db.DateTime, default=utcnow)

    created_by = db.relationship("User")
    votes = db.relationship("PollVote", back_populates="poll", lazy="dynamic", cascade="all, delete-orphan")

    def options(self):
        import json
        return json.loads(self.options_json)

    def to_dict(self, current_user_id=None):
        import json
        opts = json.loads(self.options_json)
        vote_counts = [0] * len(opts)
        user_vote = None
        for vote in self.votes:
            if 0 <= vote.option_index < len(opts):
                vote_counts[vote.option_index] += 1
            if current_user_id and vote.user_id == current_user_id:
                user_vote = vote.option_index
        total = sum(vote_counts)
        return {
            "id": self.id,
            "question": self.question,
            "options": [
                {
                    "index": i,
                    "text": opt,
                    "votes": vote_counts[i],
                    "percent": round(vote_counts[i] / total * 100) if total else 0,
                }
                for i, opt in enumerate(opts)
            ],
            "total_votes": total,
            "user_vote": user_vote,
        }


class PollVote(db.Model):
    __tablename__ = "poll_votes"
    __table_args__ = (db.UniqueConstraint("poll_id", "user_id", name="uq_poll_vote"),)

    id = db.Column(db.Integer, primary_key=True)
    poll_id = db.Column(db.Integer, db.ForeignKey("polls.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    option_index = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    poll = db.relationship("Poll", back_populates="votes")
    user = db.relationship("User")


class Reminder(db.Model):
    __tablename__ = "reminders"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    channel_id = db.Column(db.Integer, db.ForeignKey("channels.id"))
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id"))
    message_preview = db.Column(db.String(300))
    remind_at = db.Column(db.DateTime, nullable=False, index=True)
    sent = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    user = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "channel_id": self.channel_id,
            "message_id": self.message_id,
            "message_preview": self.message_preview or "",
            "remind_at": self.remind_at.isoformat(),
            "sent": self.sent,
        }
