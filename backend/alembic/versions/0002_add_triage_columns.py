"""Add auto-triage columns to incidents table

Revision ID: 0002_triage
Revises: 0001_initial
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0002_triage'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('incidents', sa.Column('triage_score', sa.Integer(), nullable=True))
    op.add_column('incidents', sa.Column('triage_reason', sa.Text(), nullable=True))
    op.add_column('incidents', sa.Column('auto_triaged_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('incidents', 'auto_triaged_at')
    op.drop_column('incidents', 'triage_reason')
    op.drop_column('incidents', 'triage_score')
