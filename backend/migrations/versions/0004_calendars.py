"""calendar sources and events

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("color", sa.String(16), nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_calendar_sources_owner_id", "calendar_sources", ["owner_id"])
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("calendar_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_minute", sa.Integer(), nullable=False),
        sa.Column("end_minute", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
    )
    op.create_index("ix_calendar_events_source_id", "calendar_events", ["source_id"])
    op.create_index("ix_calendar_events_owner_date", "calendar_events", ["owner_id", "date"])


def downgrade() -> None:
    op.drop_table("calendar_events")
    op.drop_table("calendar_sources")
