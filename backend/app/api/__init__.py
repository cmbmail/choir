from flask import Blueprint

api_bp = Blueprint("api", __name__)

from app.api import (  # noqa: E402, F401
    auth,
    choirs,
    documents,
    invites,
    members,
    projects,
    roles,
    system,
    works,
)
