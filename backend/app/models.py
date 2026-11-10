"""ORM models. Every schema change also needs an Alembic migration (migrations/versions).

Times of day are minutes after local midnight (Europe/Berlin by default, `User.timezone`):
a block from 7:30 to 8:00 is start_minute=450, end_minute=480. A day is a calendar date
in the user's time zone, so a plan never shifts when the clocks change.
"""
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# What a block is about - colour and icon in the UI (frontend/src/lib/categories.ts).
CATEGORIES = ("meal", "care", "commute", "work", "chores", "sport", "leisure", "other")
# fixed: blocks stay where they are. cascade: a block running late pushes the ones after it.
DELAY_MODES = ("fixed", "cascade")
BLOCK_SOURCES = ("template", "manual", "calendar")
BLOCK_STATUSES = ("open", "done", "skipped")
TEMPLATE_KINDS = ("day", "module")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """A platform user, created on their first request (identity comes from the gateway).

    Also holds the settings: the default delay mode and how many minutes before a block
    a notification comes (None = only at the start)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Stable identity from the gateway (X-Auth-Request-User).
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Berlin")
    delay_mode: Mapped[str] = mapped_column(String(16), default="fixed")
    notify_lead_minutes: Mapped[int | None] = mapped_column(Integer)
    # Push when a block starts (the advance notice above is separate).
    notify_start: Mapped[bool] = mapped_column(Boolean, default=True)
    # The starter templates are created once; deleting them later must not bring them back.
    templates_seeded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Template(Base):
    """A plan to copy from: a whole day (`day`) or a module like training (`module`)."""

    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(16), default="blue")
    icon: Mapped[str] = mapped_column(String(16), default="")
    kind: Mapped[str] = mapped_column(String(16), default="day")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    blocks: Mapped[list["TemplateBlock"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="TemplateBlock.start_minute"
    )


class TemplateBlock(Base):
    __tablename__ = "template_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("templates.id", ondelete="CASCADE"), index=True)
    # Minutes after midnight. A module is inserted shifted as a whole, so that its first
    # block starts at the chosen time.
    start_minute: Mapped[int] = mapped_column(Integer)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(16), default="other")
    # Titles of the subtasks every copy of this block starts with.
    subtasks: Mapped[list[str]] = mapped_column(JSON, default=list)

    template: Mapped[Template] = relationship(back_populates="blocks")


class WeekdayAssignment(Base):
    """Which day template a weekday starts from (0 = Monday)."""

    __tablename__ = "weekday_assignments"

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    weekday: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("templates.id", ondelete="CASCADE"))


class Day(Base):
    """One planned date. Created on first access as a copy of its template - changing the
    day never changes the template."""

    __tablename__ = "days"
    __table_args__ = (UniqueConstraint("owner_id", "date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("templates.id", ondelete="SET NULL"))
    # None = the user's default (User.delay_mode).
    delay_mode: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    blocks: Mapped[list["Block"]] = relationship(
        back_populates="day", cascade="all, delete-orphan", order_by="(Block.start_minute, Block.id)"
    )


class Block(Base):
    __tablename__ = "blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day_id: Mapped[int] = mapped_column(ForeignKey("days.id", ondelete="CASCADE"), index=True)
    start_minute: Mapped[int] = mapped_column(Integer)
    end_minute: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(16), default="other")
    source: Mapped[str] = mapped_column(String(16), default="manual")
    status: Mapped[str] = mapped_column(String(16), default="open")
    # When it really started and ended (statistics); set by the status buttons.
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    day: Mapped[Day] = relationship(back_populates="blocks")
    subtasks: Mapped[list["Subtask"]] = relationship(
        back_populates="block", cascade="all, delete-orphan", order_by="(Subtask.position, Subtask.id)"
    )


class Subtask(Base):
    __tablename__ = "subtasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    block_id: Mapped[int] = mapped_column(ForeignKey("blocks.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    block: Mapped[Block] = relationship(back_populates="subtasks")


class PushSubscription(Base):
    """One per device/browser that turned notifications on (endpoint + keys from the browser)."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255))
    auth: Mapped[str] = mapped_column(String(255))
    # Language the device's notifications are written in.
    language: Mapped[str] = mapped_column(String(8), default="de")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NotificationLog(Base):
    """What was sent already - every notification goes out at most once."""

    __tablename__ = "notification_log"
    __table_args__ = (UniqueConstraint("user_id", "key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(200))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
