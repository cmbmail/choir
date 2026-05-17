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
        <td><button type="button" class="action-btn" data-rename="${c.choir_id}">改名</button></td>
      </tr>`
      )
      .join("");
    tbody.querySelectorAll("[data-rename]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.closest("tr")?.querySelector("strong")?.textContent || "";
        renameChoir(+btn.dataset.rename, name);
      });
    });
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
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init({ systemAdminOnly: true, onReady: setupPage });
  });
})();
