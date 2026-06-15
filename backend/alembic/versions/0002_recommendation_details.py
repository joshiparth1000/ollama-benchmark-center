"""add recommendation details

Revision ID: 0002_recommendation_details
Revises: 0001_initial
Create Date: 2026-06-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_recommendation_details"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recommendations", sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.alter_column("recommendations", "details", server_default=None)


def downgrade() -> None:
    op.drop_column("recommendations", "details")
