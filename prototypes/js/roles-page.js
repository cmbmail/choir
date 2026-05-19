/**
 * 角色权限管理（roles.manage）
 */
(function () {
  const PERM_LABELS = {
    "choir.rename": "修改本团团名",
    "choir.suspend": "停用/恢复本团",
    "members.read": "查看成员",
    "members.write": "编辑成员",
    "members.assign_role": "分配角色",
    "invites.create": "创建邀请码",
    "invites.revoke": "作废邀请码",
    "roles.manage": "管理角色权限",
    "system.monitor": "查看操作日志",
    "documents.read": "查看资料",
    "documents.write": "上传/编辑资料",
    "documents.*": "资料管理（全部）",
    "works.read": "查看作品",
    "works.write": "编辑作品信息",
    "works.*": "作品管理（全部）",
    "recordings.read": "查看录音",
    "recordings.write": "上传/管理录音",
    "recordings.*": "录音管理（全部）",
    "projects.read": "查看项目管理",
    "projects.write": "编辑项目管理",
    "projects.*": "项目管理（全部）",
  };

  let catalog = [];
  let roles = [];
  let editingRoleId = null;

  function toast(msg, isErr) {
    const el = document.getElementById("toast");
    if (!el) {
      if (isErr) ChoirDialog.alert(msg); else ChoirDialog.toast(msg);
      return;
    }
    el.textContent = msg;
    el.className = isErr ? "toast toast-err" : "toast";
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 3500);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getChoirId() {
    const user = window.ChoirMembersPage?.getCurrentUser?.();
    if (!user) return null;
    if (user.system_super_admin) {
      return document.getElementById("filter-choir")?.value || null;
    }
    return user.choir_id;
  }

  async function openRolesModal() {
    const choirId = getChoirId();
    if (!choirId) {
      toast("请先选择合唱团", true);
      return;
    }
    try {
      const [permRes, roleRes] = await Promise.all([
        ChoirAPI.get("/choir/permissions"),
        ChoirAPI.get(`/choir/roles?choir_id=${choirId}`),
      ]);
      catalog = permRes.permissions || [];
      roles = roleRes.roles || [];
      renderRolesList();
      document.getElementById("modal-roles")?.classList.add("open");
    } catch (e) {
      toast(e.message, true);
    }
  }

  function closeRolesModal() {
    document.getElementById("modal-roles")?.classList.remove("open");
    editingRoleId = null;
    document.getElementById("role-editor")?.setAttribute("hidden", "");
  }

  function renderRolesList() {
    const root = document.getElementById("roles-list");
    if (!root) return;
    root.innerHTML = roles
      .map(
        (r) => `
      <div class="role-row" data-role-id="${r.role_id}">
        <div>
          <strong>${esc(r.name)}</strong>
          <span style="color:var(--text-muted);font-size:0.8rem;margin-left:0.5rem">${esc(r.role_code)}</span>
          ${r.is_builtin ? '<span class="tag-lock">内置</span>' : ""}
        </div>
        <button type="button" class="action-btn" data-edit-role="${r.role_id}">编辑权限</button>
      </div>`
      )
      .join("");
    root.querySelectorAll("[data-edit-role]").forEach((btn) => {
      btn.addEventListener("click", () => startEdit(+btn.dataset.editRole));
    });
  }

  function startEdit(roleId) {
    const role = roles.find((r) => r.role_id === roleId);
    if (!role) return;
    editingRoleId = roleId;
    const editor = document.getElementById("role-editor");
    editor.hidden = false;
    document.getElementById("role-editor-title").textContent = `编辑：${role.name}`;
    const perms = new Set(role.permissions || []);
    const box = document.getElementById("role-perm-checks");
    box.innerHTML = catalog
      .map(
        (p) => `
      <label class="perm-check">
        <input type="checkbox" value="${esc(p)}" ${perms.has(p) ? "checked" : ""} />
        <span>${esc(PERM_LABELS[p] || p)}</span>
      </label>`
      )
      .join("");
  }

  async function saveRolePerms() {
    if (!editingRoleId) return;
    const checked = [...document.querySelectorAll("#role-perm-checks input:checked")].map(
      (el) => el.value
    );
    try {
      await ChoirAPI.put(`/choir/roles/${editingRoleId}`, { permissions: checked });
      toast("权限已保存");
      const choirId = getChoirId();
      const roleRes = await ChoirAPI.get(`/choir/roles?choir_id=${choirId}`);
      roles = roleRes.roles || [];
      renderRolesList();
      editingRoleId = null;
      document.getElementById("role-editor").hidden = true;
      if (window.ChoirMembersPage?.reloadRoles) await window.ChoirMembersPage.reloadRoles();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function init() {
    document.getElementById("btn-roles")?.addEventListener("click", openRolesModal);
    document.querySelectorAll("[data-close-roles]").forEach((el) => {
      el.addEventListener("click", closeRolesModal);
    });
    document.getElementById("btn-save-role-perms")?.addEventListener("click", saveRolePerms);
  }

  document.addEventListener("DOMContentLoaded", init);
  window.ChoirRolesPage = { openRolesModal };
})();
