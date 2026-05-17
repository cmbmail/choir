/**
 * 资料管理 — 浏览资料；乐谱请从作品管理进入上传
 */
(function () {
  const extIcon = {
    pdf: "doc-icon-pdf",
    doc: "doc-icon-doc",
    xlsx: "doc-icon-pdf2",
    mp3: "doc-icon-doc",
    mp4: "doc-icon-pdf",
  };
  const tagCls = {
    score: { cls: "tag-pdf", label: "乐谱" },
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
  let currentTab = "all";
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

  function toast(msg) {
    alert(msg);
  }

  function isScoreTab() {
    return currentTab === "score";
  }

  function updateScoreUi() {
    const banner = document.getElementById("scoreWorkBanner");
    const sf = document.getElementById("scoreFilters");
    const thWork = document.getElementById("thWork");
    if (banner) banner.style.display = isScoreTab() ? "block" : "none";
    if (sf) sf.style.display = isScoreTab() ? "flex" : "none";
    if (thWork) thWork.hidden = !isScoreTab();
  }

  async function loadDocs() {
    if (isScoreTab()) {
      docs = [];
      renderDocs();
      return;
    }
    const p = new URLSearchParams();
    if (currentTab !== "all") p.set("type", currentTab);
    if (filterCategory !== "all") p.set("category", filterCategory);
    if (filterCollection !== "all") p.set("collection", filterCollection);
    if (searchKeyword) p.set("q", searchKeyword);
    const qs = p.toString() ? `?${p}` : "";
    const data = await ChoirAPI.get(`/documents${qs}`);
    docs = data.documents || [];
    renderDocs();
  }

  function renderDocs() {
    const list = docs;
    const countEl = document.getElementById("docCount");
    if (countEl) {
      countEl.textContent = isScoreTab()
        ? "请从作品管理进入"
        : "共 " + list.length + " 条";
    }
    const body = document.getElementById("docTableBody");
    if (!body) return;
    if (isScoreTab()) {
      body.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">乐谱已按作品管理。<a href="极简中式-作品管理.html" style="color:var(--ink-gold)">前往作品管理 →</a></td></tr>';
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
          actionHtml =
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
        const workCol =
          d.work_name
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
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        currentTab = tab.dataset.tab;
        updateScoreUi();
        await loadDocs();
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
        loadDocs();
      });
    });
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;
    window.ChoirPermissions.applyNavPermissions(currentUser);
    bindTabs();
    initFilter("filterCategory", "category");
    initFilter("filterCollection", "collection");
    initFilter("filterStyle", "style");
    const search = document.getElementById("searchInput");
    if (search) {
      search.addEventListener("input", (e) => {
        searchKeyword = e.target.value;
        loadDocs();
      });
    }
    updateScoreUi();
    await loadDocs();
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
