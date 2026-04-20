"""add fulltext index on products(name, brand)

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-20

Note: parser `ngram` chỉ có trên MySQL 8 (built-in). MariaDB không hỗ trợ,
nên runtime-detect và bỏ `WITH PARSER ngram` khi chạy trên MariaDB.
Tiếng Việt có dấu + space-delimited nên parser mặc định vẫn hoạt động
cho tokenization cơ bản; phase 3 nâng cấp khi thật sự dùng search.
"""
from alembic import op
from sqlalchemy import text


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _is_mariadb() -> bool:
    bind = op.get_bind()
    version = bind.execute(text("SELECT VERSION()")).scalar() or ""
    return "mariadb" in str(version).lower()


def upgrade() -> None:
    if _is_mariadb():
        op.execute(
            "ALTER TABLE products "
            "ADD FULLTEXT INDEX ftx_products_name_brand (name, brand)"
        )
    else:
        op.execute(
            "ALTER TABLE products "
            "ADD FULLTEXT INDEX ftx_products_name_brand (name, brand) "
            "WITH PARSER ngram"
        )


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP INDEX ftx_products_name_brand")
