"""Add rescue teams and resources tables and columns

Revision ID: 0006_resources
Revises: 0005_simplify_roles
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0006_resources'
down_revision: Union[str, None] = '0005_simplify_roles'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── response_teams: contact, members_count, current_incident_id ──
    with op.batch_alter_table('response_teams') as batch_op:
        batch_op.add_column(sa.Column('contact', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('members_count', sa.Integer(), server_default='5', nullable=False))
        batch_op.add_column(sa.Column('current_incident_id', sa.Integer(), sa.ForeignKey('incidents.id', ondelete='SET NULL'), nullable=True))

    # ── places: current_occupancy ───────────────────────────────────
    with op.batch_alter_table('places') as batch_op:
        batch_op.add_column(sa.Column('current_occupancy', sa.Integer(), server_default='0', nullable=False))

    # ── vehicles table ──────────────────────────────────────────────
    op.create_table(
        'vehicles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('plate', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='available', nullable=False),
        sa.Column('assigned_team_id', sa.Integer(), sa.ForeignKey('response_teams.id', ondelete='SET NULL'), nullable=True),
        sa.Column('current_incident_id', sa.Integer(), sa.ForeignKey('incidents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_vehicles_id'), 'vehicles', ['id'], unique=False)
    op.create_index(op.f('ix_vehicles_plate'), 'vehicles', ['plate'], unique=True)
    op.create_index(op.f('ix_vehicles_assigned_team_id'), 'vehicles', ['assigned_team_id'], unique=False)
    op.create_index(op.f('ix_vehicles_current_incident_id'), 'vehicles', ['current_incident_id'], unique=False)

    # ── supplies table ──────────────────────────────────────────────
    op.create_table(
        'supplies',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item', sa.String(length=150), nullable=False),
        sa.Column('category', sa.String(length=50), server_default='other', nullable=False),
        sa.Column('quantity', sa.Integer(), server_default='0', nullable=False),
        sa.Column('unit', sa.String(length=50), server_default='units', nullable=False),
        sa.Column('low_stock_threshold', sa.Integer(), server_default='10', nullable=False),
        sa.Column('location', sa.String(length=200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_supplies_id'), 'supplies', ['id'], unique=False)
    op.create_index(op.f('ix_supplies_category'), 'supplies', ['category'], unique=False)

    # ── incident_supply_allocations table ───────────────────────────
    op.create_table(
        'incident_supply_allocations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('incident_id', sa.Integer(), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('supply_id', sa.Integer(), sa.ForeignKey('supplies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('quantity', sa.Integer(), server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_incident_supply_allocations_id'), 'incident_supply_allocations', ['id'], unique=False)
    op.create_index(op.f('ix_incident_supply_allocations_incident_id'), 'incident_supply_allocations', ['incident_id'], unique=False)


def downgrade() -> None:
    op.drop_table('incident_supply_allocations')
    op.drop_table('supplies')
    op.drop_table('vehicles')

    with op.batch_alter_table('places') as batch_op:
        batch_op.drop_column('current_occupancy')

    with op.batch_alter_table('response_teams') as batch_op:
        batch_op.drop_column('current_incident_id')
        batch_op.drop_column('members_count')
        batch_op.drop_column('contact')

