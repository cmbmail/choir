import click
from flask import Flask

from app.extensions import db
from app.services.work_trash import TRASH_RETENTION_DAYS, purge_expired_works


def register_cli(app: Flask) -> None:
    @app.cli.command("purge-work-trash")
    @click.option("--choir-id", type=int, default=None, help="Limit purge to one choir")
    def purge_work_trash(choir_id):
        """Permanently delete works in recycle bin older than retention period."""
        with app.app_context():
            removed = purge_expired_works(choir_id)
            db.session.commit()
        click.echo(
            f"Purged {removed} work(s) from recycle bin (retention {TRASH_RETENTION_DAYS} days)."
        )
