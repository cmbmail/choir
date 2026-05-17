import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from io import BytesIO

from flask import current_app
from PIL import Image, ImageDraw, ImageFont

from app.extensions import db
from app.models import CaptchaChallenge


def _hash_answer(code: str) -> str:
    return hashlib.sha256(code.lower().encode()).hexdigest()


def create_captcha() -> tuple[str, str]:
    code = "".join(secrets.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(4))
    captcha_id = str(uuid.uuid4())
    expires = datetime.utcnow() + timedelta(minutes=current_app.config["CAPTCHA_EXPIRE_MINUTES"])
    db.session.add(
        CaptchaChallenge(
            captcha_id=captcha_id,
            answer_hash=_hash_answer(code),
            expires_at=expires,
        )
    )
    img = Image.new("RGB", (120, 40), color=(28, 28, 28))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 28)
    except OSError:
        font = ImageFont.load_default()
    draw.text((10, 5), code, fill=(184, 134, 11), font=font)
    buf = BytesIO()
    img.save(buf, format="PNG")
    import base64

    b64 = base64.b64encode(buf.getvalue()).decode()
    return captcha_id, f"data:image/png;base64,{b64}"


def verify_captcha(captcha_id: str, code: str) -> bool:
    row = CaptchaChallenge.query.get(captcha_id)
    if not row or row.is_expired():
        return False
    ok = secrets.compare_digest(row.answer_hash, _hash_answer(code))
    db.session.delete(row)
    return ok
