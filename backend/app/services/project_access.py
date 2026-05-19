"""项目管理访问控制。"""

from app.models import Project
from app.services.permissions import has_permission


def can_read_projects(user) -> bool:
    if not user:
        return False
    if user.system_super_admin:
        return True
    return has_permission(user, "projects.read") or has_permission(user, "projects.write")


def can_write_projects(user) -> bool:
    if not user:
        return False
    if user.system_super_admin:
        return True
    return has_permission(user, "projects.write")


def project_visible_to_user(user, project: Project) -> bool:
    if not can_read_projects(user):
        return False
    if user.system_super_admin:
        return True
    return project.choir_id == user.choir_id


def can_edit_project(user, project: Project) -> bool:
    if not project_visible_to_user(user, project):
        return False
    return can_write_projects(user)
