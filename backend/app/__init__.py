from flask import Flask
from flask_cors import CORS

from app.auth.csrf import csrf_protect
from app.config import Config
from app.extensions import db, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, supports_credentials=True)

    from app.api import api_bp

    app.register_blueprint(api_bp, url_prefix="/api")

    @app.before_request
    def _csrf_guard():
        return csrf_protect()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    from app.cli import register_cli

    register_cli(app)

    return app
