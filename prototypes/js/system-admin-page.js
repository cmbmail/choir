/**
 * 系统管理 — 合唱团列表与新建（系统超管）
 */
(function () {
  function toast(msg, isErr) {
    const el = document.getElementById("toast");
    if (!el) {
      if (isErr) alert(msg);
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

  async function loadChoirs() {
    const data = await ChoirAPI.get("/choirs");
    const choirs = data.choirs || [];
    const tbody = document.getElementById("choirs-tbody");
    const statChoirs = document.getElementById("stat-choirs");
    const statActive = document.getElementById("stat-active");
    if (statChoirs) statChoirs.textContent = String(choirs.length);
    if (statActive) {
      statActive.textContent = String(choirs.filter((c) => c.status === "active").length);
    }
    if (!tbody) return;
    if (!choirs.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">暂无合唱团</td></tr>';
      return;
    }
    tbody.innerHTML = choirs
      .map(
        (c) => `
      <tr data-choir-id="${c.choir_id}">
        <td><strong>${esc(c.name)}</strong></td>
        <td><code>${esc(c.slug)}</code></td>
        <td>${c.max_members}</td>
        <td><span class="status-badge ${c.status === "active" ? "badge-active" : "badge-inactive"}"><span class="badge-dot"></span>${c.status === "active" ? "正常" : "已停用"}</span></td>
        <td>—</td>
        <td>
          <button type="button" class="action-btn" data-rename="${c.choir_id}">改名</button>
          ${
            c.status === "active"
              ? `<button type="button" class="action-btn" data-suspend="${c.choir_id}">停用</button>`
              : `<button type="button" class="action-btn" data-activate="${c.choir_id}">恢复</button>`
          }
        </td>
      </tr>`
      )
      .join("");
    tbody.querySelectorAll("[data-rename]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.closest("tr")?.querySelector("strong")?.textContent || "";
        renameChoir(+btn.dataset.rename, name);
      });
    });
    tbody.querySelectorAll("[data-suspend]").forEach((btn) => {
      btn.addEventListener("click", () => setChoirStatus(+btn.dataset.suspend, "suspended"));
    });
    tbody.querySelectorAll("[data-activate]").forEach((btn) => {
      btn.addEventListener("click", () => setChoirStatus(+btn.dataset.activate, "active"));
    });
  }

  async function setChoirStatus(choirId, status) {
    const label = status === "suspended" ? "停用" : "恢复";
    if (!confirm(`确定要${label}该合唱团？`)) return;
    try {
      await ChoirAPI.patch(`/choirs/${choirId}/status`, { status });
      toast(`已${label}`);
      await loadChoirs();
      await loadLogs();
    } catch (e) {
      toast(e.message, true);
    }
  }

  const ACTION_LABELS = {
    "auth.login": "登录",
    "auth.logout": "退出",
    "auth.password_change": "修改密码",
    "choir.create": "创建合唱团",
    "choir.rename": "重命名合唱团",
    "choir.suspend": "停用合唱团",
    "choir.activate": "恢复合唱团",
    "member.register": "成员注册",
    "member.update": "更新成员",
    "member.delete": "删除成员",
    "member.unlock": "解锁成员",
    "invite.create": "创建邀请码",
    "invite.revoke": "作废邀请码",
    "role.create": "创建角色",
    "role.update": "更新角色权限",
    "role.delete": "删除角色",
  };

  async function loadLogs() {
    const root = document.getElementById("logs-list");
    if (!root) return;
    try {
      const data = await ChoirAPI.get("/system/logs?all=1&limit=30");
      const logs = data.logs || [];
      if (!logs.length) {
        root.innerHTML = '<p style="color:var(--text-muted);padding:0.5rem 0">暂无操作记录</p>';
        return;
      }
      root.innerHTML = "<ul class=\"log-list\">" + logs.map((log) => {
        const label = ACTION_LABELS[log.action] || log.action;
        const who = esc(log.user_name || "系统");
        const when = log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "";
        const detail = log.detail?.name || log.detail?.to || log.detail?.username || "";
        const extra = detail ? " · " + esc(String(detail)) : "";
        return "<li class=\"log-item\"><div class=\"log-content\"><div class=\"log-text\"><strong>" +
          who + "</strong> " + esc(label) + extra + "</div><div class=\"log-time\">" + esc(when) + "</div></div></li>";
      }).join("") + "</ul>";
    } catch (e) {
      root.innerHTML = '<p style="color:var(--error)">' + esc(e.message) + "</p>";
    }
  }

  async function renameChoir(choirId, currentName) {
    const name = prompt("合唱团名称", currentName);
    if (!name || name.trim() === currentName) return;
    try {
      await ChoirAPI.put(`/choirs/${choirId}`, { name: name.trim() });
      toast("已保存");
      await loadChoirs();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function openModal() {
    document.getElementById("modal-create-choir")?.classList.add("open");
  }

  function closeModal() {
    document.getElementById("modal-create-choir")?.classList.remove("open");
  }

  async function createChoir(e) {
    e.preventDefault();
    const name = document.getElementById("new-choir-name").value.trim();
    const max = parseInt(document.getElementById("new-choir-max").value, 10) || 100;
    try {
      const data = await ChoirAPI.post("/choirs", { name, max_members: max });
      toast(`已创建：${data.name} (${data.slug})`);
      document.getElementById("new-choir-name").value = "";
      closeModal();
      await loadChoirs();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function setupPage() {
    document.getElementById("btn-add-choir")?.addEventListener("click", openModal);
    document.getElementById("btn-refresh-choirs")?.addEventListener("click", () =>
      loadChoirs().catch((e) => toast(e.message, true))
    );
    document.getElementById("form-create-choir")?.addEventListener("submit", createChoir);
    document.querySelectorAll("[data-close-create]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });
    const logsCard = document.getElementById("logs-placeholder");
    if (logsCard) logsCard.hidden = false;
    loadChoirs().catch((e) => toast(e.message, true));
    loadLogs().catch((e) => toast(e.message, true));
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init({ systemAdminOnly: true, onReady: setupPage });
  });
})();
