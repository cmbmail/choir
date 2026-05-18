/**
 * 作品管理 — 仅列表与新建，上传在作品详情页
 */
(function () {
  const ADMIN_CHOIR_KEY = "choir_admin_selected_choir_id";
  let currentUser = null;
  let works = [];
  let choirs = [];

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function canCreate() {
    return (
      currentUser?.system_super_admin ||
      window.ChoirAuth.hasPermission(currentUser, "documents.write") ||
      window.ChoirAuth.hasPermission(currentUser, "recordings.write")
    );
  }

  function formatDate(iso) {
    if (!iso) return "—";
    return iso.slice(0, 10);
  }

  function getAdminChoirId() {
    const sel = document.getElementById("adminChoirSelect");
    if (!sel?.value) return null;
    const cid = parseInt(sel.value, 10);
    return Number.isFinite(cid) ? cid : null;
  }

  async function loadChoirsForAdmin() {
    const wrap = document.getElementById("adminChoirWrap");
    const sel = document.getElementById("adminChoirSelect");
    if (!currentUser?.system_super_admin || !wrap || !sel) return;
    wrap.hidden = false;
    const data = await ChoirAPI.get("/choirs");
    choirs = data.choirs || [];
    sel.innerHTML = choirs
      .map((c) => `<option value="${c.choir_id}">${esc(c.name)}</option>`)
      .join("");
    const saved = sessionStorage.getItem(ADMIN_CHOIR_KEY);
    if (saved && choirs.some((c) => String(c.choir_id) === saved)) {
      sel.value = saved;
    }
    sel.addEventListener("change", () => {
      sessionStorage.setItem(ADMIN_CHOIR_KEY, sel.value);
      loadWorks().catch((e) => alert(e.message || "加载失败"));
    });
  }

  async function loadWorks() {
    let path = "/works?include_recordings=0";
    if (currentUser?.system_super_admin) {
      const cid = getAdminChoirId();
      if (!cid) {
        works = [];
        renderWorks([]);
        return;
      }
      path += `&choir_id=${cid}`;
    }
    const data = await ChoirAPI.get(path);
    works = data.works || [];
    renderWorks(works);
  }

  function filterWorks() {
    const q = (document.getElementById("searchWork")?.value || "").trim().toLowerCase();
    const list = !q
      ? works
      : works.filter(
          (w) =>
            (w.name || "").toLowerCase().includes(q) ||
            (w.composer || "").toLowerCase().includes(q)
        );
    renderWorks(list);
  }

  function renderWorks(list) {
    const container = document.getElementById("workList");
    if (!container) return;
    if (!list.length) {
      container.innerHTML =
        '<div class="empty-state"><p>暂无作品</p><p class="hint">点击「新建作品」创建，进入作品后上传乐谱与资料</p></div>';
      return;
    }
    container.innerHTML = list
      .map((w) => {
        const shared =
          w.shared_choir_names && w.shared_choir_names.length
            ? `<span class="work-meta-item">共享：${esc(w.shared_choir_names.join("、"))}</span>`
            : "";
        const owner =
          !w.is_owner && w.owner_choir_name
            ? `<span class="work-meta-item">来自 ${esc(w.owner_choir_name)}</span>`
            : "";
        return `
        <a class="work-card work-card-link" href="极简中式-作品详情.html?work_id=${w.work_id}">
          <div class="work-card-header">
            <div class="work-info">
              <div class="work-name">${esc(w.name)}</div>
              <div class="work-meta">
                ${w.composer ? `<span class="work-meta-item">${esc(w.composer)}</span>` : ""}
                <span class="work-meta-item">乐谱 ${w.score_count || 0}</span>
                <span class="work-meta-item">资料 ${w.doc_count || 0}</span>
                <span class="work-meta-item">${formatDate(w.created_at)}</span>
                ${owner}
                ${shared}
              </div>
            </div>
            <span class="work-open-hint">进入 →</span>
          </div>
        </a>`;
      })
      .join("");
  }

  async function createWork() {
    const name = prompt("作品名称");
    if (!name || !name.trim()) return;
    const composer = prompt("作曲者（可选）", "") || "";
    const body = { name: name.trim(), composer: composer.trim() };
    if (currentUser.system_super_admin) {
      const cid = getAdminChoirId();
      if (!cid) {
        alert("请选择所属合唱团");
        return;
      }
      body.choir_id = cid;
      sessionStorage.setItem(ADMIN_CHOIR_KEY, String(cid));
    }
    try {
      const res = await ChoirAPI.post("/works", body);
      await loadWorks();
      if (res.work_id) {
        window.location.href = "极简中式-作品详情.html?work_id=" + res.work_id;
      }
    } catch (e) {
      alert(e.message || "创建失败");
    }
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;
    window.ChoirPermissions.applyNavPermissions(currentUser);

    const btn = document.getElementById("btnNewWork");
    if (btn) {
      if (canCreate()) btn.addEventListener("click", createWork);
      else btn.hidden = true;
    }

    document.getElementById("searchWork")?.addEventListener("input", filterWorks);
    await loadChoirsForAdmin();
    await loadWorks();
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init();
    init().catch((e) => {
      if (e.message !== "未登录") alert(e.message || "加载失败");
    });
  });
})();
