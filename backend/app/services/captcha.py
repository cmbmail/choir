import base64
import hashlib
import random
import secrets
import uuid
from datetime import datetime, timedelta
from io import BytesIO

from flask import current_app
from PIL import Image, ImageDraw, ImageFont

from app.extensions import db
from app.models import CaptchaChallenge

# Linux (ACL3) / macOS 字体回退
_FONT_CANDIDATES = [
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/google-noto/NotoSansSC-Bold.otf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]

IMG_W, IMG_H = 200, 72
FONT_SIZE = 42


def _hash_answer(code: str) -> str:
    return hashlib.sha256(code.lower().encode()).hexdigest()


def _load_font() -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, FONT_SIZE)
        except OSError:
            continue
    return ImageFont.load_default()


def create_captcha() -> tuple[str, str]:
    chars = "abcdefghjkmnpqrstuvwxyz23456789"
    code = "".join(secrets.choice(chars) for _ in range(4))
    captcha_id = str(uuid.uuid4())
    expires = datetime.utcnow() + timedelta(minutes=current_app.config["CAPTCHA_EXPIRE_MINUTES"])
    db.session.add(
        CaptchaChallenge(
            captcha_id=captcha_id,
            answer_hash=_hash_answer(code),
            expires_at=expires,
        )
    )

    img = Image.new("RGB", (IMG_W, IMG_H), color=(28, 28, 28))
    draw = ImageDraw.Draw(img)
    font = _load_font()

    # 干扰线
    for _ in range(6):
        draw.line(
            (
                random.randint(0, IMG_W),
                random.randint(0, IMG_H),
                random.randint(0, IMG_W),
                random.randint(0, IMG_H),
            ),
            fill=(60, 60, 60),
            width=1,
        )

    # 逐字绘制，略错位，提高可读性
    x = 18
    for ch in code:
        y = random.randint(8, 18)
        draw.text((x, y), ch, fill=(230, 190, 80), font=font)
        x += 42

    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return captcha_id, f"data:image/png;base64,{b64}"


def verify_captcha(captcha_id: str, code: str) -> bool:
    row = CaptchaChallenge.query.get(captcha_id)
    if not row or row.is_expired():
        return False
    ok = secrets.compare_digest(row.answer_hash, _hash_answer(code))
    db.session.delete(row)
    return ok
