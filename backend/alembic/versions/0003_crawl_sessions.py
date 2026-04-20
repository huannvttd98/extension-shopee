"""add crawl_sessions + product_crawl_sessions

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crawl_sessions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("keyword", sa.String(500)),
        sa.Column("source", sa.String(32), server_default="autoscan", nullable=False),
        sa.Column("tab_url", sa.String(1000)),
        sa.Column("max_scrolls", sa.Integer),
        sa.Column(
            "started_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime),
        sa.Column("status", sa.String(32), server_default="running", nullable=False),
        sa.Column("reason", sa.String(64)),
        sa.Column(
            "scroll_ticks", sa.Integer, server_default="0", nullable=False
        ),
        sa.Column(
            "items_seen", sa.Integer, server_default="0", nullable=False
        ),
        sa.Column(
            "products_upserted", sa.Integer, server_default="0", nullable=False
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("idx_crawl_sessions_status", "crawl_sessions", ["status"])
    op.create_index(
        "idx_crawl_sessions_started", "crawl_sessions", ["started_at"]
    )
    op.create_index(
        "idx_crawl_sessions_keyword",
        "crawl_sessions",
        [sa.text("keyword(191)")],
    )

    op.create_table(
        "product_crawl_sessions",
        sa.Column("product_id", sa.BigInteger, primary_key=True),
        sa.Column("session_id", sa.BigInteger, primary_key=True),
        sa.Column(
            "first_seen_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            ondelete="CASCADE",
            name="fk_pcs_product",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["crawl_sessions.id"],
            ondelete="CASCADE",
            name="fk_pcs_session",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("idx_pcs_session", "product_crawl_sessions", ["session_id"])


def downgrade() -> None:
    op.drop_index("idx_pcs_session", table_name="product_crawl_sessions")
    op.drop_table("product_crawl_sessions")
    op.drop_index("idx_crawl_sessions_keyword", table_name="crawl_sessions")
    op.drop_index("idx_crawl_sessions_started", table_name="crawl_sessions")
    op.drop_index("idx_crawl_sessions_status", table_name="crawl_sessions")
    op.drop_table("crawl_sessions")
