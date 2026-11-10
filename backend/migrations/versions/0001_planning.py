"""users, templates, days, blocks, subtasks

Revision ID: 0001
Revises:
Create Date: 2026-11-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Europe/Berlin"),
        sa.Column("delay_mode", sa.String(16), nullable=False, server_default="fixed"),
        sa.Column("notify_lead_minutes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("color", sa.String(16), nullable=False),
        sa.Column("icon", sa.String(16), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_templates_owner_id", "templates", ["owner_id"])

    op.create_table(
        "template_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_minute", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("subtasks", sa.JSON(), nullable=False),
    )
    op.create_index("ix_template_blocks_template_id", "template_blocks", ["template_id"])

    op.create_table(
        "weekday_assignments",
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("weekday", sa.Integer(), primary_key=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
    )

    op.create_table(
        "days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("delay_mode", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "date"),
    )
    op.create_index("ix_days_owner_id", "days", ["owner_id"])

    op.create_table(
        "blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("day_id", sa.Integer(), sa.ForeignKey("days.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_minute", sa.Integer(), nullable=False),
        sa.Column("end_minute", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("actual_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_blocks_day_id", "blocks", ["day_id"])

    op.create_table(
        "subtasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("block_id", sa.Integer(), sa.ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_subtasks_block_id", "subtasks", ["block_id"])


def downgrade() -> None:
    for table in ("subtasks", "blocks", "days", "weekday_assignments", "template_blocks", "templates", "users"):
        op.drop_table(table)
