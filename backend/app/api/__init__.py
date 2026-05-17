from flask import Blueprint

api_bp = Blueprint("api", __name__)

from app.api import auth, choirs, invites, members, roles  # noqa: E402, F401
