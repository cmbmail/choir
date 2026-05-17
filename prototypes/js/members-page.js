/**
 * 成员管理页 — 接 /api/members、/api/invites、/api/choir/roles
 */
(function () {
  const VOICE = {
    1: "S1", 2: "S2", 3: "A1", 4: "A2", 5: "T1", 6: "T2", 7: "B1", 8: "B2",
  };
  const VOICE_CLASS = {
    1: "vb-soprano", 2: "vb-soprano", 3: "vb-alto", 4: "vb-alto",
    5: "vb-tenor", 6: "vb-tenor", 7: "vb-bass", 8: "vb-bass",
  };
  const STATUS_LABEL = { active: "正常", leave: "请假", inactive: "停用" };
  const STATUS_DOT = { active: "dot-active", leave: "dot-leave", inactive: "dot-inactive" };
  const INVITE_STATUS = {
    active: "有效",
    revoked: "已作废",
    expired: "已过期",
    exhausted: "已用完",
  };

  let currentUser = null;
  let roles = [];
  let members = [];

  function toast(msg, isErr) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = isErr ? "toast toast-err" : "toast";
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 3500);
  }

  function can(p) {
    return window.ChoirAuth.hasPermission(currentUser, p);
  }

  function avatarChar(name) {
    return (name || "?").charAt(0);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildQuery() {
    const p = new URLSearchParams();
    const vp = document.getElementById("filter-voice")?.value;
    const st = document.getElementById("filter-status")?.value;
    const q = document.getElementById("filter-q")?.value?.trim();
    if (vp) p.set("voice_part", vp);
    if (st) p.set("status", st);
    if (q) p.set("q", q);
    if (currentUser?.system_super_admin) {
      const cid = document.getElementById("filter-choir")?.value;
      if (cid) p.set("choir_id", cid);
    }
    return p.toString() ? `?${p}` : "";
  }

  async function loadRoles(choirId) {
    if (!can("roles.manage") && !can("members.assign_role")) return;
    const cid = choirId || currentUser.choir_id || currentUser.choir?.choir_id;
    if (!cid) return;
    try {
      const data = await ChoirAPI.get(`/choir/roles?choir_id=${cid}`);
      roles = data.roles || [];
    } catch {
      roles = [];
    }
  }

  async function loadMembers() {
    const data = await ChoirAPI.get(`/members${buildQuery()}`);
    members = data.members || [];
    document.getElementById("page-subtitle").textContent =
      `合唱团成员信息管理 · 共 ${members.length} 人`;
    renderMembers();
  }

  function renderMembers() {
    const root = document.getElementById("members-root");
    if (!members.length) {
      root.innerHTML = '<p class="empty-hint">暂无成员，可点击「添加成员」生成邀请码</p>';
      return;
    }

    const groups = {};
    members.forEach((m) => {
      const vp = m.voice_part || 0;
      if (!groups[vp]) groups[vp] = [];
      groups[vp].push(m);
    });

    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let html = "";
    order.forEach((vp) => {
      const list = groups[vp];
      if (!list?.length) return;
      const title = vp === 0 ? "未分配声部" : `声部 ${VOICE[vp] || vp}`;
      html += `<div class="voice-section"><div class="section-header"><div class="section-title"><h3>${title}</h3><span class="section-count">${list.length} 人</span></div></div><div class="member-grid">`;
      list.forEach((m) => {
        html += renderCard(m);
      });
      html += "</div></div>";
    });
    root.innerHTML = html;
    bindCardActions();
  }

  function renderCard(m) {
    const locked = m.locked_until ? `<span class="tag-lock">已锁定</span>` : "";
    const vpLabel = m.voice_part ? VOICE[m.voice_part] : "—";
    const vc = VOICE_CLASS[m.voice_part] || "vb-alto";
    let actions = "";
    const fullWrite =
      currentUser.system_super_admin ||
      (can("members.write") && currentUser.role_code !== "section_leader");
    if (can("members.write")) {
      actions += `<button type="button" class="btn btn-outline btn-xs" data-act="edit" data-id="${m.user_id}">编辑</button>`;
      if (m.locked_until && fullWrite) {
        actions += `<button type="button" class="btn btn-outline btn-xs" data-act="unlock" data-id="${m.user_id}">解锁</button>`;
      }
    }
    if (fullWrite && m.user_id !== currentUser.user_id) {
      actions += `<button type="button" class="btn btn-outline btn-xs" data-act="delete" data-id="${m.user_id}">删除</button>`;
    }
    return `
      <div class="member-card" data-id="${m.user_id}">
        <div class="member-top">
          <div class="member-avatar">${avatarChar(m.name)}</div>
          <div class="member-info">
            <div class="member-name">${esc(m.name)}</div>
            <div class="member-id">${esc(m.username)}</div>
            <span class="member-voice ${vc}">${esc(vpLabel)}</span>
          </div>
        </div>
        <div class="member-meta">
          <span>角色 ${esc(m.role_name || "—")}</span>
          <span>失败 ${m.failed_login_count || 0} 次</span>
          ${locked}
        </div>
        <div class="member-footer">
          <div class="member-status">
            <span class="status-dot ${STATUS_DOT[m.status] || ""}"></span>${STATUS_LABEL[m.status] || m.status}
          </div>
          <div class="member-actions">${actions}</div>
        </div>
      </div>`;
  }

  function bindCardActions() {
    document.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = +btn.dataset.id;
        const act = btn.dataset.act;
        if (act === "edit") await openEditModal(id);
        if (act === "unlock") await unlockMember(id);
        if (act === "delete") await deleteMember(id);
      });
    });
  }

  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
  }

  async function openEditModal(userId) {
    const m = members.find((x) => x.user_id === userId);
    if (!m) return;
    await loadRoles(m.choir_id);
    document.getElementById("edit-user-id").value = m.user_id;
    document.getElementById("edit-name").value = m.name || "";
    document.getElementById("edit-voice").value = m.voice_part || "";
    document.getElementById("edit-status").value = m.status || "active";
    const roleSel = document.getElementById("edit-role");
    roleSel.innerHTML = '<option value="">—</option>';
    roles.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.role_id;
      opt.textContent = r.name;
      if (m.role_id === r.role_id) opt.selected = true;
      roleSel.appendChild(opt);
    });
    roleSel.disabled = !can("members.assign_role");
    openModal("modal-edit");
  }

  async function saveEdit(e) {
    e.preventDefault();
    const id = document.getElementById("edit-user-id").value;
    const body = {
      name: document.getElementById("edit-name").value.trim(),
      voice_part: document.getElementById("edit-voice").value
        ? parseInt(document.getElementById("edit-voice").value, 10) : null,
      status: document.getElementById("edit-status").value,
    };
    const rid = document.getElementById("edit-role").value;
    if (rid && can("members.assign_role")) body.role_id = parseInt(rid, 10);
    try {
      await ChoirAPI.put(`/members/${id}`, body);
      closeModal("modal-edit");
      toast("已保存");
      await loadMembers();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function inviteListQuery() {
    const p = new URLSearchParams();
    if (currentUser.system_super_admin) {
      const cid =
        document.getElementById("invite-choir-id")?.value ||
        document.getElementById("filter-choir")?.value;
      if (cid) p.set("choir_id", cid);
    }
    return p.toString() ? `?${p}` : "";
  }

  async function loadInvites() {
    if (!can("invites.create")) return;
    const data = await ChoirAPI.get(`/invites${inviteListQuery()}`);
    renderInviteList(data.invites || []);
  }

  function renderInviteList(list) {
    const wrap = document.getElementById("invite-list-wrap");
    const root = document.getElementById("invite-list");
    if (!wrap || !root) return;
    wrap.hidden = false;
    if (!list.length) {
      root.innerHTML = '<p class="empty-hint" style="padding:1rem">暂无邀请码</p>';
      return;
    }
    let html =
      '<table class="invite-table"><thead><tr><th>状态</th><th>使用</th><th>声部</th><th>过期</th><th></th></tr></thead><tbody>';
    list.forEach((inv) => {
      const vp = inv.voice_part ? VOICE[inv.voice_part] : "—";
      const exp = inv.expires_at ? inv.expires_at.slice(0, 10) : "—";
      const st = INVITE_STATUS[inv.status] || inv.status;
      const revokeBtn =
        inv.can_revoke && can("invites.revoke")
          ? `<button type="button" class="btn btn-outline btn-xs" data-revoke="${inv.invite_id}">作废</button>`
          : "";
      html += `<tr>
        <td class="invite-status-${inv.status}">${st}</td>
        <td>${inv.use_count}/${inv.max_uses}</td>
        <td>${vp}</td>
        <td>${exp}</td>
        <td>${revokeBtn}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    root.innerHTML = html;
    root.querySelectorAll("[data-revoke]").forEach((btn) => {
      btn.addEventListener("click", () => revokeInvite(+btn.dataset.revoke));
    });
  }

  async function revokeInvite(id) {
    if (!confirm("确定作废该邀请码？")) return;
    try {
      await ChoirAPI.del(`/invites/${id}`);
      toast("已作废");
      await loadInvites();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function openInviteModal() {
    document.getElementById("invite-result").hidden = true;
    document.getElementById("invite-result").textContent = "";
    const choirRow = document.getElementById("invite-choir-row");
    const choirSel = document.getElementById("invite-choir-id");
    if (currentUser.system_super_admin) {
      choirRow.hidden = false;
      const data = await ChoirAPI.get("/choirs");
      choirSel.innerHTML = "";
      (data.choirs || []).forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.choir_id;
        opt.textContent = `${c.name} (${c.slug})`;
        choirSel.appendChild(opt);
      });
    } else {
      choirRow.hidden = true;
    }
    openModal("modal-invite");
    await loadInvites();
  }

  async function createInvite(e) {
    e.preventDefault();
    const body = {
      expires_in_days: parseInt(document.getElementById("invite-days").value, 10) || 7,
      max_uses: parseInt(document.getElementById("invite-max").value, 10) || 1,
    };
    const vp = document.getElementById("invite-voice").value;
    if (vp) body.voice_part = parseInt(vp, 10);
    if (currentUser.system_super_admin) {
      const cid = document.getElementById("invite-choir-id")?.value;
      if (cid) body.choir_id = parseInt(cid, 10);
    }
    try {
      const data = await ChoirAPI.post("/invites", body);
      const box = document.getElementById("invite-result");
      box.hidden = false;
      const url = esc(data.register_url || "");
      const code = esc(data.invite_code || "");
      box.innerHTML = `邀请码：<strong>${code}</strong><br>注册链接：<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
      toast("邀请码已生成");
      await loadInvites();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function unlockMember(id) {
    if (!confirm("确定解锁该账号？")) return;
    try {
      await ChoirAPI.post(`/members/${id}/unlock`, {});
      toast("已解锁");
      await loadMembers();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function deleteMember(id) {
    if (!confirm("确定删除该成员？不可恢复")) return;
    try {
      await ChoirAPI.del(`/members/${id}`);
      toast("已删除");
      await loadMembers();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function fillUserUI() {
    const name = currentUser.name || currentUser.username;
    const role = currentUser.role_name || (currentUser.system_super_admin ? "系统超管" : "成员");
    document.querySelectorAll(".sidebar-user-name, .brand-area-name").forEach((el) => {
      el.textContent = name;
    });
    document.querySelectorAll(".sidebar-user-role").forEach((el) => {
      el.textContent = role;
    });
    document.querySelectorAll(".user-avatar, .sidebar-user-avatar").forEach((el) => {
      el.textContent = avatarChar(name);
    });
    const choirName = currentUser.choir?.name || "";
    if (choirName) {
      const sub = document.getElementById("page-subtitle");
      if (sub) sub.textContent = `${choirName} · 成员管理`;
    }
  }

  async function setupChoirFilter() {
    const row = document.getElementById("filter-choir-row");
    const sel = document.getElementById("filter-choir");
    if (!currentUser.system_super_admin || !row || !sel) return;
    row.hidden = false;
    const data = await ChoirAPI.get("/choirs");
    sel.innerHTML = '<option value="">全部合唱团</option>';
    (data.choirs || []).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.choir_id;
      opt.textContent = `${c.name} (${c.slug})`;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => loadMembers());
  }

  async function setupPage(user) {
    currentUser = user;
    fillUserUI();

    document.getElementById("btn-add-member")?.addEventListener("click", () =>
      openInviteModal().catch((e) => toast(e.message, true))
    );
    document.getElementById("btn-invites")?.addEventListener("click", () =>
      openInviteModal().catch((e) => toast(e.message, true))
    );
    document.getElementById("btn-refresh")?.addEventListener("click", () => loadMembers().catch((e) => toast(e.message, true)));
    document.getElementById("filter-voice")?.addEventListener("change", () => loadMembers());
    document.getElementById("filter-status")?.addEventListener("change", () => loadMembers());
    document.getElementById("filter-q")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadMembers();
    });
    document.getElementById("btn-search")?.addEventListener("click", () =>
      loadMembers().catch((e) => toast(e.message, true))
    );
    document.getElementById("form-edit")?.addEventListener("submit", saveEdit);
    document.getElementById("form-invite")?.addEventListener("submit", createInvite);
    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", () => closeModal(el.dataset.close));
    });
    const exportBtn = document.getElementById("btn-export");
    if (exportBtn) exportBtn.hidden = true;

    if (!can("invites.create")) {
      document.getElementById("btn-add-member").hidden = true;
    } else {
      const btnInv = document.getElementById("btn-invites");
      if (btnInv) btnInv.hidden = false;
    }
    const btnRoles = document.getElementById("btn-roles");
    if (btnRoles) btnRoles.hidden = !can("roles.manage");

    await setupChoirFilter();
    const inviteChoirSel = document.getElementById("invite-choir-id");
    if (inviteChoirSel && currentUser.system_super_admin) {
      inviteChoirSel.addEventListener("change", () =>
        loadInvites().catch((e) => toast(e.message, true))
      );
    }
    await loadRoles(currentUser.choir_id);
    await loadMembers();
  }

  window.ChoirMembersPage = {
    getCurrentUser: () => currentUser,
    reloadRoles: async () => {
      const cid =
        currentUser?.system_super_admin
          ? document.getElementById("filter-choir")?.value
          : currentUser?.choir_id;
      await loadRoles(cid ? +cid : currentUser?.choir_id);
    },
  };

  async function init() {
    const user = await ChoirAppShell.init({
      requiredPerm: "members.read",
      onReady: (u) => setupPage(u),
    });
    if (!user) return;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
