"""Initial database schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users table ───────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column(
            'role',
            sa.Enum('citizen', 'volunteer', 'responder', 'admin', name='roleenum'),
            nullable=False,
            server_default='citizen',
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # ── teams table ───────────────────────────────────────────
    op.create_table(
        'teams',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column(
            'type',
            sa.Enum('rescue', 'medical', 'volunteer', name='teamtypeenum'),
            nullable=False,
        ),
        sa.Column('contact', sa.String(length=200), nullable=True),
        sa.Column('is_available', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_teams_id'), 'teams', ['id'], unique=False)

    # ── resources table ───────────────────────────────────────
    op.create_table(
        'resources',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column(
            'type',
            sa.Enum('shelter', 'food', 'medical_supply', 'vehicle', name='resourcetypeenum'),
            nullable=False,
        ),
        sa.Column('quantity', sa.Integer(), server_default='0', nullable=True),
        sa.Column('is_available', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_resources_id'), 'resources', ['id'], unique=False)

    # ── incidents table ───────────────────────────────────────
    op.create_table(
        'incidents',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('reporter_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column(
            'category',
            sa.Enum('rescue', 'medical', 'food_water', 'shelter', 'other', name='categoryenum'),
            nullable=False,
        ),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('location_text', sa.String(length=300), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('people_affected', sa.Integer(), server_default='1', nullable=True),
        sa.Column(
            'priority',
            sa.Enum('low', 'medium', 'high', 'critical', name='priorityenum'),
            server_default='medium',
            nullable=True,
        ),
        sa.Column(
            'status',
            sa.Enum('reported', 'assigned', 'in_progress', 'resolved', name='statusenum'),
            server_default='reported',
            nullable=True,
        ),
        sa.Column('photo_key', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_incidents_id'), 'incidents', ['id'], unique=False)

    # ── assignments table ─────────────────────────────────────
    op.create_table(
        'assignments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('incident_id', sa.Integer(), sa.ForeignKey('incidents.id'), nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=False),
        sa.Column('assigned_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_assignments_id'), 'assignments', ['id'], unique=False)

    # ── status_history table ──────────────────────────────────
    op.create_table(
        'status_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('incident_id', sa.Integer(), sa.ForeignKey('incidents.id'), nullable=False),
        sa.Column('old_status', sa.Enum('reported', 'assigned', 'in_progress', 'resolved', name='statusenum'), nullable=False),
        sa.Column('new_status', sa.Enum('reported', 'assigned', 'in_progress', 'resolved', name='statusenum'), nullable=False),
        sa.Column('changed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('changed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
    )
    op.create_index(op.f('ix_status_history_id'), 'status_history', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('status_history')
    op.drop_table('assignments')
    op.drop_table('incidents')
    op.drop_table('resources')
    op.drop_table('teams')
    op.drop_table('users')
