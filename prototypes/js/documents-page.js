/**
 * 资料管理 — 「全部资料」为作品列表；其它标签为团内资料
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

  function isWorksListTab() {
    return currentTab === "all";
  }

  function getAdminChoirId() {
    const sel = document.getElementById("adminChoirSelect");
    if (!sel?.value) return null;
    const cid = parseInt(sel.value, 10);
    return Number.isFinite(cid) ? cid : null;
  }

  function requireChoirIdForWrite() {
    if (currentUser?.system_super_admin) {
      const cid = getAdminChoirId();
      if (!cid) {
        alert("请先选择所属合唱团");
        return null;
      }
      return cid;
    }
    return currentUser.choir_id;
  }

  function workNameFromPdfFilename(filename) {
    const base = (filename || "").replace(/\.[^.]+$/, "").trim();
    return base || "未命名作品";
  }

  function workEntryHref(w) {
    if (w.primary_score_id) {
      return "极简中式-乐谱详情.html?id=" + w.primary_score_id;
    }
    return "极简中式-乐谱详情.html?work_id=" + w.work_id;
  }

  function workEntryLabel() {
    return "进入";
  }

  function navigateToWork(w) {
    window.location.href = workEntryHref(w);
  }

  function tabFromUrl() {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "works") return "all";
    if (tab && document.querySelector(`.tab[data-tab="${tab}"]`)) return tab;
    return "all";
  }

  function setActiveTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabId);
    });
    updateListChrome();
  }

  function updateListChrome() {
    const worksMode = isWorksListTab();
    const actions = document.getElementById("workListActions");
    const stats = document.getElementById("docsStatsRow");
    const subFilters = document.getElementById("scoreFilters");
    const worksHead = document.getElementById("worksTableHeadRow");
    const docsHead = document.getElementById("docsTableHeadRow");
    const cardTitle = document.getElementById("listCardTitle");
    const search = document.getElementById("searchInput");

    if (actions) actions.hidden = !worksMode || !canWrite();
    if (stats) stats.hidden = worksMode;
    if (subFilters) subFilters.style.display = worksMode ? "none" : "none";
    if (worksHead) worksHead.hidden = !worksMode;
    if (docsHead) docsHead.hidden = worksMode;
    if (cardTitle) cardTitle.textContent = worksMode ? "作品列表" : "资料列表";
    if (search) {
      search.placeholder = worksMode
        ? "搜索作品名称、作曲者..."
        : "搜索资料名称、合集、风格、分类...";
    }
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
      reloadList().catch((e) => toast(e.message || "加载失败"));
    });
  }

  async function reloadList() {
    if (isWorksListTab()) await loadWorks();
    else await loadDocs();
  }

  async function loadWorks() {
    let path = "/works?include_recordings=0";
    if (currentUser?.system_super_admin) {
      const cid = getAdminChoirId();
      if (!cid) {
        works = [];
        renderWorks();
        return;
      }
      path += `&choir_id=${cid}`;
    }
    const data = await ChoirAPI.get(path);
    works = data.works || [];
    renderWorks();
  }

  function filterWorksList() {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return works;
    return works.filter(
      (w) =>
        (w.name || "").toLowerCase().includes(q) ||
        (w.composer || "").toLowerCase().includes(q)
    );
  }

  function renderWorks() {
    const list = filterWorksList();
    const countEl = document.getElementById("docCount");
    if (countEl) countEl.textContent = "共 " + list.length + " 个作品";
    const body = document.getElementById("docTableBody");
    if (!body) return;
    if (!list.length) {
      body.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">暂无作品，可点击「新建」或「导入」批量添加 PDF 歌谱</td></tr>';
      return;
    }
    body.innerHTML = list
      .map((w) => {
        const owner =
          !w.is_owner && w.owner_choir_name
            ? '<br><span style="font-size:0.65rem;color:var(--text-muted)">来自 ' +
              esc(w.owner_choir_name) +
              "</span>"
            : "";
        return (
          "<tr>" +
          '<td><div class="doc-name-cell">' +
          '<div class="doc-icon doc-icon-pdf"></div>' +
          '<div><div class="doc-name-text">' +
          '<a href="' +
          workEntryHref(w) +
          '" style="color:inherit">' +
          esc(w.name) +
          "</a>" +
          owner +
          "</div></div></td>" +
          "<td>" +
          esc(w.composer || "—") +
          "</td>" +
          "<td>" +
          (w.score_count || 0) +
          "</td>" +
          "<td>" +
          (w.doc_count || 0) +
          "</td>" +
          "<td>" +
          formatDate(w.created_at) +
          "</td>" +
          '<td><a class="doc-action-btn" href="' +
          workEntryHref(w) +
          '">' +
          workEntryLabel() +
          "</a></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function createWork() {
    const choirId = requireChoirIdForWrite();
    if (!choirId) return;
    const name = prompt("作品名称");
    if (!name || !name.trim()) return;
    const composer = prompt("作曲者（可选）", "") || "";
    const body = { name: name.trim(), composer: composer.trim() };
    if (currentUser.system_super_admin) body.choir_id = choirId;
    try {
      const res = await ChoirAPI.post("/works", body);
      await loadWorks();
      if (res.work_id) {
        navigateToWork(res);
      }
    } catch (e) {
      toast(e.message || "创建失败");
    }
  }

  function openPdfImport() {
    if (!canWrite()) return;
    document.getElementById("importPdfInput")?.click();
  }

  async function importPdfScores(fileList) {
    const choirId = requireChoirIdForWrite();
    if (!choirId) return;
    const pdfs = Array.from(fileList || []).filter((f) =>
      (f.name || "").toLowerCase().endsWith(".pdf")
    );
    if (!pdfs.length) {
      toast("请选择 PDF 歌谱文件");
      return;
    }
    if (
      !confirm(
        `将导入 ${pdfs.length} 个 PDF，每个文件创建一个作品（名称为文件名），并上传为歌谱。是否继续？`
      )
    ) {
      return;
    }

    let ok = 0;
    let lastImportedWork = null;
    const errors = [];
    for (const file of pdfs) {
      const workName = workNameFromPdfFilename(file.name).slice(0, 100);
      try {
        const body = { name: workName, composer: "" };
        if (currentUser.system_super_admin) body.choir_id = choirId;
        const work = await ChoirAPI.post("/works", body);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", file.name);
        fd.append("doc_type", "score");
        fd.append("work_id", String(work.work_id));
        const uploaded = await ChoirAPI.postForm("/documents/upload", fd);
        ok += 1;
        if (uploaded.document_id) {
          work.primary_score_id = uploaded.document_id;
          lastImportedWork = work;
        }
      } catch (e) {
        errors.push(`${file.name}: ${e.message || "失败"}`);
      }
    }
    await loadWorks();
    if (errors.length && ok) {
      toast(`成功 ${ok} 个，失败 ${errors.length} 个：\n` + errors.slice(0, 5).join("\n"));
    } else if (errors.length) {
      toast("导入失败：\n" + errors.slice(0, 8).join("\n"));
    } else {
      toast(`已成功导入 ${ok} 个作品及歌谱`);
      if (ok === 1 && lastImportedWork?.primary_score_id) {
        navigateToWork(lastImportedWork);
      }
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
          "</div></div></td>" +
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
        await reloadList();
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
        if (!isWorksListTab()) loadDocs();
      });
    });
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;
    window.ChoirPermissions.applyNavPermissions(currentUser);

    setActiveTab(tabFromUrl());

    const btnNew = document.getElementById("btnNewWork");
    if (btnNew && canWrite()) btnNew.addEventListener("click", createWork);

    const btnImport = document.getElementById("btnImportPdf");
    if (btnImport && canWrite()) btnImport.addEventListener("click", openPdfImport);

    const importInput = document.getElementById("importPdfInput");
    if (importInput) {
      importInput.addEventListener("change", () => {
        const files = importInput.files;
        importInput.value = "";
        if (files?.length) importPdfScores(files);
      });
    }

    bindTabs();
    initFilter("filterCategory", "category");
    initFilter("filterCollection", "collection");
    initFilter("filterStyle", "style");
    const search = document.getElementById("searchInput");
    if (search) {
      search.addEventListener("input", (e) => {
        searchKeyword = e.target.value;
        if (isWorksListTab()) renderWorks();
        else loadDocs();
      });
    }

    await loadChoirsForAdmin();
    await reloadList();
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init();
    init().catch((e) => {
      console.error(e);
      if (e.message !== "未登录") toast(e.message || "加载失败");
    });
  });
})();
