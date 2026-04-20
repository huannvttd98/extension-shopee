"""init schema: shops, categories, products, crawl_log

Revision ID: 0001
Revises:
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shops",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=False),
        sa.Column("name", sa.String(255)),
        sa.Column("location", sa.String(128)),
        sa.Column("rating", sa.Numeric(3, 2)),
        sa.Column("follower_count", sa.Integer),
        sa.Column("raw_json", sa.JSON),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=False),
        sa.Column("name", sa.String(255)),
        sa.Column("parent_id", sa.BigInteger, index=True),
        sa.Column("level", sa.SmallInteger),
        sa.Column("raw_json", sa.JSON),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )

    op.create_table(
        "products",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=False),
        sa.Column("shop_id", sa.BigInteger),
        sa.Column("category_id", sa.BigInteger),
        sa.Column("name", sa.String(500)),
        sa.Column("price", sa.BigInteger),
        sa.Column("price_min", sa.BigInteger),
        sa.Column("price_max", sa.BigInteger),
        sa.Column("currency", sa.String(8), server_default="VND"),
        sa.Column("stock", sa.Integer),
        sa.Column("sold", sa.Integer),
        sa.Column("historical_sold", sa.Integer),
        sa.Column("liked_count", sa.Integer),
        sa.Column("rating_avg", sa.Numeric(3, 2)),
        sa.Column("rating_count", sa.Integer),
        sa.Column("image", sa.String(255)),
        sa.Column("images_json", sa.JSON),
        sa.Column("brand", sa.String(128)),
        sa.Column("location", sa.String(128)),
        sa.Column("raw_json", sa.JSON),
        sa.Column(
            "first_seen_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["shop_id"], ["shops.id"], ondelete="SET NULL", name="fk_products_shop"
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            ondelete="SET NULL",
            name="fk_products_category",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("idx_products_shop", "products", ["shop_id"])
    op.create_index("idx_products_category", "products", ["category_id"])
    op.create_index("idx_products_name", "products", [sa.text("name(191)")])
    op.create_index("idx_products_last_seen", "products", ["last_seen_at"])

    op.create_table(
        "crawl_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("endpoint", sa.String(255), index=True),
        sa.Column("source_url", sa.String(1000)),
        sa.Column("items_count", sa.Integer),
        sa.Column(
            "received_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
            index=True,
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )


def downgrade() -> None:
    op.drop_table("crawl_log")
    op.drop_index("idx_products_last_seen", table_name="products")
    op.drop_index("idx_products_name", table_name="products")
    op.drop_index("idx_products_category", table_name="products")
    op.drop_index("idx_products_shop", table_name="products")
    op.drop_table("products")
    op.drop_table("categories")
    op.drop_table("shops")
