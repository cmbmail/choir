/**
 * 资料管理 — 作品列表 + 团内资料浏览
 */
(function () {
  const ADMIN_CHOIR_KEY = "choir_admin_selected_choir_id";
  const extIcon = {
    pdf: "doc-icon-pdf",
    doc: "doc-icon-doc",
    xlsx: "doc-icon-pdf2",
    mp3: "doc-icon-doc",
    mp4: "doc-icon-pdf",
  };
  const tagCls = {
    score: { cls: "tag-pdf", label: "乐谱" },
    accompaniment: { cls: "tag-img", label: "伴奏" },
    performance_video: { cls: "tag-ppt", label: "献唱视频" },
    notes: { cls: "tag-doc", label: "说明" },
    video: { cls: "tag-ppt", label: "视频" },
    courseware: { cls: "tag-ppt", label: "课件" },
    text: { cls: "tag-doc", label: "文本" },
    audio: { cls: "tag-img", label: "音频" },
    perf: { cls: "tag-ppt", label: "演出资料" },
    rule: { cls: "tag-doc", label: "规章制度" },
    rehearsal: { cls: "tag-img", label: "排练资料" },
    other: { cls: "tag-doc", label: "其他" },
  };

  let currentUser = null;
  let docs = [];
  let works = [];
  let choirs = [];
  let currentTab = "works";
  let searchKeyword = "";
  let filterCategory = "all";
  let filterCollection = "all";
  let filterStyle = "all";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSize(n) {
    if (!n) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    return iso.slice(0, 10);
  }

  function canWrite() {
    return (
      currentUser?.system_super_admin ||
      window.ChoirAuth.hasPermission(currentUser, "documents.write")
    );
  }

  function canCreateWork() {
    return (
      currentUser?.system_super_admin ||
      window.ChoirAuth.hasPermission(currentUser, "documents.write") ||
      window.ChoirAuth.hasPermission(currentUser, "recordings.write")
    );
  }

  function toast(msg) {
    alert(msg);
  }

  function isWorksTab() {
    return currentTab === "works";
  }

  function getAdminChoirId() {
    const sel = document.getElementById("adminChoirSelect");
    if (!sel?.value) return null;
    const cid = parseInt(sel.value, 10);
    return Number.isFinite(cid) ? cid : null;
  }

  function updatePanels() {
    const worksPanel = document.getElementById("worksPanel");
    const docsPanel = document.getElementById("docsPanel");
    const statsRow = document.getElementById("docsStatsRow");
    const btnNew = document.getElementById("btnNewWork");
    if (worksPanel) worksPanel.hidden = !isWorksTab();
    if (docsPanel) docsPanel.hidden = isWorksTab();
    if (statsRow) statsRow.hidden = isWorksTab();
    if (btnNew) btnNew.hidden = !isWorksTab() || !canCreateWork();
  }

  function tabFromUrl() {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && document.querySelector(`.tab[data-tab="${tab}"]`)) return tab;
    return "works";
  }

  function setActiveTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabId);
    });
    updatePanels();
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
      const reload = isWorksTab() ? loadWorks() : loadDocs();
      reload.catch((e) => toast(e.message || "加载失败"));
    });
  }

  async function loadWorks() {
    const container = document.getElementById("workList");
    if (container) {
      container.innerHTML =
        '<div class="empty-state"><p>正在加载作品…</p></div>';
    }
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
        '<div class="empty-state"><p>暂无作品</p><p class="hint">点击「新建作品」创建，进入作品后上传乐谱、伴奏与资料</p></div>';
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
      toast(e.message || "创建失败");
    }
  }

  async function loadDocs() {
    const p = new URLSearchParams();
    if (currentTab !== "all") p.set("type", currentTab);
    if (filterCategory !== "all") p.set("category", filterCategory);
    if (filterCollection !== "all") p.set("collection", filterCollection);
    if (searchKeyword) p.set("q", searchKeyword);
    if (currentUser?.system_super_admin) {
      const cid = getAdminChoirId();
      if (!cid) {
        docs = [];
        renderDocs();
        return;
      }
      p.set("choir_id", String(cid));
    }
    const qs = p.toString() ? `?${p}` : "";
    const data = await ChoirAPI.get(`/documents${qs}`);
    docs = data.documents || [];
    renderDocs();
  }

  function renderDocs() {
    const list = docs;
    const countEl = document.getElementById("docCount");
    if (countEl) countEl.textContent = "共 " + list.length + " 条";
    const body = document.getElementById("docTableBody");
    if (!body) return;
    if (!list.length) {
      body.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">暂无资料</td></tr>';
      return;
    }
    body.innerHTML = list
      .map((d) => {
        const ext = d.ext || "doc";
        const eiCls = extIcon[ext] || extIcon.doc;
        const tc = tagCls[d.doc_type] || tagCls[d.type] || tagCls.other;
        const title = d.title || d.name || "未命名";
        const isScore = d.doc_type === "score" || d.type === "score";
        let actionHtml = "";
        if (isScore) {
          actionHtml +=
            '<a class="doc-action-btn" href="极简中式-乐谱详情.html?id=' +
            d.document_id +
            '">查看</a> ';
        }
        if (d.video_url) {
          actionHtml +=
            '<button type="button" class="doc-action-btn" data-play-video="' +
            esc(d.video_url) +
            '" data-title="' +
            esc(title) +
            '">▶ 播放</button>';
        } else if (d.stream_url) {
          actionHtml +=
            '<button type="button" class="doc-action-btn" data-play-stream="' +
            d.document_id +
            '">▶ 在线播放</button>';
        }
        let delBtn = "";
        if (canWrite()) {
          delBtn =
            '<button type="button" class="doc-action-btn danger" data-del="' +
            d.document_id +
            '">删除</button>';
        }
        const workCol = d.work_name
          ? "<td>" +
            esc(d.work_name) +
            (d.work_composer
              ? '<br><span style="font-size:0.65rem;color:var(--text-muted)">' +
                esc(d.work_composer) +
                "</span>"
              : "") +
            "</td>"
          : "<td>—</td>";
        return (
          "<tr>" +
          '<td><div class="doc-name-cell">' +
          '<div class="doc-icon ' +
          eiCls +
          '"></div>' +
          '<div><div class="doc-name-text">' +
          esc(title) +
          "</div></div></div></td>" +
          workCol +
          '<td><span class="doc-tag ' +
          tc.cls +
          '">' +
          tc.label +
          "</span></td>" +
          "<td>" +
          esc(d.uploader || "—") +
          "</td>" +
          "<td>" +
          formatDate(d.created_at) +
          "</td>" +
          "<td>" +
          formatSize(d.file_size) +
          "</td>" +
          '<td style="display:flex;flex-wrap:wrap;gap:4px;">' +
          actionHtml +
          delBtn +
          "</td></tr>"
        );
      })
      .join("");

    body.querySelectorAll("[data-play-video]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.openVideoModal(btn.dataset.playVideo, btn.dataset.title);
      });
    });
    body.querySelectorAll("[data-play-stream]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await window.ChoirMedia.playDocument(btn.dataset.playStream);
        } catch (e) {
          toast(e.message || "无法播放");
        }
      });
    });
    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("确定删除该资料？")) return;
        try {
          await ChoirAPI.del(`/documents/${btn.dataset.del}`);
          await loadDocs();
        } catch (e) {
          toast(e.message || "删除失败");
        }
      });
    });
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", async () => {
        setActiveTab(tab.dataset.tab);
        if (isWorksTab()) await loadWorks();
        else await loadDocs();
      });
    });
  }

  function initFilter(groupId, setVar) {
    document.querySelectorAll("#" + groupId + " .filter-opt").forEach((opt) => {
      opt.addEventListener("click", () => {
        document
          .querySelectorAll("#" + groupId + " .filter-opt")
          .forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        if (setVar === "category") filterCategory = opt.dataset.val;
        if (setVar === "collection") filterCollection = opt.dataset.val;
        if (setVar === "style") filterStyle = opt.dataset.val;
        if (!isWorksTab()) loadDocs();
      });
    });
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;
    window.ChoirPermissions.applyNavPermissions(currentUser);

    setActiveTab(tabFromUrl());

    const btnNew = document.getElementById("btnNewWork");
    if (btnNew) {
      if (canCreateWork()) btnNew.addEventListener("click", createWork);
      else btnNew.hidden = true;
    }

    document.getElementById("searchWork")?.addEventListener("input", filterWorks);
    bindTabs();
    initFilter("filterCategory", "category");
    initFilter("filterCollection", "collection");
    initFilter("filterStyle", "style");
    const search = document.getElementById("searchInput");
    if (search) {
      search.addEventListener("input", (e) => {
        searchKeyword = e.target.value;
        if (!isWorksTab()) loadDocs();
      });
    }

    await loadChoirsForAdmin();
    if (isWorksTab()) await loadWorks();
    else await loadDocs();
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init();
    init().catch((e) => {
      console.error(e);
      if (e.message !== "未登录") alert(e.message || "加载失败");
    });
  });
})();
