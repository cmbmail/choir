"""Builtin role permission templates (v2.1.5)."""

FULL_ADMIN = [
    "choir.rename",
    "choir.suspend",
    "members.read",
    "members.write",
    "members.assign_role",
    "invites.create",
    "invites.revoke",
    "roles.manage",
    "system.monitor",
    "documents.*",
    "recordings.*",
]

CONDUCTOR_DEFAULT = [p for p in FULL_ADMIN if p != "choir.suspend"] + [
    "documents.read",
    "recordings.read",
]

ALL_PHASE1_PERMISSIONS = [
    "choir.rename",
    "choir.suspend",
    "members.read",
    "members.write",
    "members.assign_role",
    "invites.create",
    "invites.revoke",
    "roles.manage",
    "system.monitor",
]

BUILTIN_ROLE_TEMPLATES = [
    ("super_admin", "团内超管", FULL_ADMIN),
    ("conductor", "指挥", CONDUCTOR_DEFAULT),
    (
        "class_leader",
        "班长",
        [
            "members.read",
            "members.write",
            "invites.create",
            "invites.revoke",
            "documents.read",
            "documents.write",
            "recordings.read",
        ],
    ),
    (
        "section_leader",
        "声部长",
        ["members.read", "members.write", "documents.read", "documents.write"],
    ),
    ("general_affairs", "总务", ["members.read", "documents.*", "recordings.*"]),
    ("member", "团员", ["documents.read", "recordings.read"]),
]


def has_permission(user, key: str) -> bool:
    if not user:
        return False
    if user.system_super_admin:
        return True
    perms = user.permissions
    if "*" in perms:
        return True
    if key in perms:
        return True
    prefix = key.split(".")[0] + ".*"
    return prefix in perms


def is_section_leader(user) -> bool:
    return user and user.role_code == "section_leader"


def can_access_member(actor, target) -> bool:
    if actor.system_super_admin:
        return True
    if actor.choir_id != target.choir_id:
        return False
    if has_permission(actor, "members.read") and not is_section_leader(actor):
        return True
    if is_section_leader(actor):
        return (
            actor.voice_part is not None
            and target.voice_part is not None
            and actor.voice_part == target.voice_part
        )
    return False


def can_write_member(actor, target) -> bool:
    if actor.system_super_admin:
        return True
    if actor.choir_id != target.choir_id:
        return False
    if has_permission(actor, "members.write") and not is_section_leader(actor):
        return True
    if is_section_leader(actor):
        return (
            actor.voice_part is not None
            and target.voice_part is not None
            and actor.voice_part == target.voice_part
        )
    return False
