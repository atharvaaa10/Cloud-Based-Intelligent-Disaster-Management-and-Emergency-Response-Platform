"""Simplify user role system to citizen and admin only

Revision ID: 0005_simplify_roles
Revises: 0004_pune_schema
Create Date: 2026-10-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0005_simplify_roles'
down_revision: Union[str, None] = '0004_pune_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Safely convert any existing users with role 'responder' or 'volunteer' to 'citizen'
    op.execute("UPDATE users SET role = 'citizen' WHERE role IN ('responder', 'volunteer')")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Create new enum type with only ('citizen', 'admin')
        op.execute("CREATE TYPE roleenum_new AS ENUM ('citizen', 'admin')")
        # Drop server default before type change
        op.execute("ALTER TABLE users ALTER COLUMN role DROP DEFAULT")
        # Alter column using text cast to new type
        op.execute("ALTER TABLE users ALTER COLUMN role TYPE roleenum_new USING role::text::roleenum_new")
        # Restore default with new enum
        op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'citizen'::roleenum_new")
        # Drop old type and rename new type
        op.execute("DROP TYPE roleenum")
        op.execute("ALTER TYPE roleenum_new RENAME TO roleenum")
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column(
                "role",
                existing_type=sa.String(length=20),
                type_=sa.Enum('citizen', 'admin', name='roleenum'),
                existing_nullable=False,
                server_default='citizen',
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Create old enum type with ('citizen', 'volunteer', 'responder', 'admin')
        op.execute("CREATE TYPE roleenum_old AS ENUM ('citizen', 'volunteer', 'responder', 'admin')")
        op.execute("ALTER TABLE users ALTER COLUMN role DROP DEFAULT")
        op.execute("ALTER TABLE users ALTER COLUMN role TYPE roleenum_old USING role::text::roleenum_old")
        op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'citizen'::roleenum_old")
        op.execute("DROP TYPE roleenum")
        op.execute("ALTER TYPE roleenum_old RENAME TO roleenum")
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column(
                "role",
                existing_type=sa.String(length=20),
                type_=sa.Enum('citizen', 'volunteer', 'responder', 'admin', name='roleenum'),
                existing_nullable=False,
                server_default='citizen',
            )

