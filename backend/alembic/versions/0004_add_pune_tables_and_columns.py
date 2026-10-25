"""Add Pune disaster tables (places, response_teams, notifications) and extended columns

Revision ID: 0004_pune_schema
Revises: 0003_audit_log
Create Date: 2026-10-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0004_pune_schema'
down_revision: Union[str, None] = '0003_audit_log'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users table: add full_name and phone ──────────────────
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('full_name', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('phone', sa.String(length=50), nullable=True))

    # Copy existing name into full_name if any
    op.execute("UPDATE users SET full_name = name WHERE full_name IS NULL")

    # ── incidents table: add public_code, tracking_code, address
    with op.batch_alter_table('incidents') as batch_op:
        batch_op.add_column(sa.Column('public_code', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('tracking_code', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('address', sa.String(length=300), nullable=True))

    # Backfill address from location_text, public_code from id
    op.execute("UPDATE incidents SET address = location_text WHERE address IS NULL")
    op.execute("UPDATE incidents SET public_code = 'DR-' || id WHERE public_code IS NULL")
    op.execute("UPDATE incidents SET tracking_code = 'TRK-' || id WHERE tracking_code IS NULL")

    with op.batch_alter_table('incidents') as batch_op:
        batch_op.create_index(op.f('ix_incidents_public_code'), ['public_code'], unique=True)
        batch_op.create_index(op.f('ix_incidents_tracking_code'), ['tracking_code'], unique=False)

    # ── status_history table: add created_at column ───────────
    with op.batch_alter_table('status_history') as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))

    op.execute("UPDATE status_history SET created_at = changed_at WHERE created_at IS NULL")

    # ── notifications table ───────────────────────────────────
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('incident_id', sa.Integer(), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_index(op.f('ix_notifications_incident_id'), 'notifications', ['incident_id'], unique=False)

    # ── places table ──────────────────────────────────────────
    op.create_table(
        'places',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('address', sa.String(length=300), nullable=False),
        sa.Column('capacity', sa.Integer(), server_default='0', nullable=False),
        sa.Column('available', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('contact', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_places_id'), 'places', ['id'], unique=False)
    op.create_index(op.f('ix_places_type'), 'places', ['type'], unique=False)

    # ── response_teams table ──────────────────────────────────
    op.create_table(
        'response_teams',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='available', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_response_teams_id'), 'response_teams', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('response_teams')
    op.drop_table('places')
    op.drop_table('notifications')

    with op.batch_alter_table('incidents') as batch_op:
        batch_op.drop_index(op.f('ix_incidents_tracking_code'))
        batch_op.drop_index(op.f('ix_incidents_public_code'))
        batch_op.drop_column('address')
        batch_op.drop_column('tracking_code')
        batch_op.drop_column('public_code')

    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('phone')
        batch_op.drop_column('full_name')
