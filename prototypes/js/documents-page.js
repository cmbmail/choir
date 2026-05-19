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
    rule: { cls: "tag-doc", label: "图文档案" },
    rehearsal: { cls: "tag-img", label: "排练资料" },
    other: { cls: "tag-doc", label: "其他" },
  };

  let currentUser = null;
  let docs = [];
  let works = [];
  let trashWorks = [];
  let choirs = [];
  let choirContexts = [];
  let choirContextMultiple = false;
  let currentTab = "all";
  let trashRetentionDays = 7;
  let searchKeyword = "";
  let filterCategory = "all";
  let filterCollection = "all";
  let filterStyle = "all";
  let pendingImportFiles = [];
  let pendingDocImportFiles = [];
  let pendingDocImportType = "";
  let pendingNewDocTitle = "";

  const TAB_LABELS = {
    all: "作品",
    perf: "演出资料",
    rehearsal: "排练资料",
    rule: "规章制度",
  };

  /** 各 Tab 导入/列表文案；规章制度 Tab 导入内容为图文档案 */
  const RULE_ARCHIVE_ACCEPT =
    ".pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.ppt,.pptx,.wps,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.tif,.tiff";
  const RULE_ARCHIVE_EXT = new Set(
    "pdf,doc,docx,txt,rtf,odt,xls,xlsx,ppt,pptx,wps,jpg,jpeg,png,gif,webp,bmp,heic,tif,tiff".split(
      ","
    )
  );
  const TAB_META = {
    perf: { importLabel: "演出资料", listTitle: "演出资料" },
    rehearsal: { importLabel: "排练资料", listTitle: "排练资料" },
    rule: {
      importLabel: "图文档案",
      listTitle: "图文档案",
      accept: RULE_ARCHIVE_ACCEPT,
      category: "图文档案",
    },
  };

  function tabImportLabel(tab) {
    return TAB_META[tab]?.importLabel || TAB_LABELS[tab] || "资料";
  }

  function isRuleArchiveFile(file) {
    const ext = ((file?.name || "").split(".").pop() || "").toLowerCase();
    return RULE_ARCHIVE_EXT.has(ext);
  }

  function filterFilesForCurrentTab(files) {
    const list = Array.from(files || []);
    if (currentTab !== "rule") return list;
    const ok = list.filter(isRuleArchiveFile);
    const skipped = list.length - ok.length;
    if (skipped) {
      toast(
        `已忽略 ${skipped} 个不符合格式的文件。图文档案支持：PDF、Word、Excel、PPT、常见图片等`
      );
    }
    return ok;
  }

  function syncDocFileInputs() {
    const accept = TAB_META[currentTab]?.accept || "";
    const importDoc = document.getElementById("importDocInput");
    const newDoc = document.getElementById("newDocFileInput");
    if (importDoc) importDoc.accept = accept;
    if (newDoc) newDoc.accept = accept;
  }

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

  function canDeleteWork(w) {
    if (currentUser?.system_super_admin) return true;
    if (w && w.is_owner === false) return false;
    return ["super_admin", "conductor", "general_affairs"].includes(
      currentUser?.role_code || ""
    );
  }

  function canEditWorkMeta(w) {
    if (!canWrite()) return false;
    if (w && w.is_owner === false) return false;
    return true;
  }

  function canManageTrash() {
    return canDeleteWork({ is_owner: true });
  }

  function toast(msg, isErr) {
    if (window.ChoirDialog) ChoirDialog.toast(msg, isErr);
    else if (isErr) console.error(msg);
    else console.log(msg);
  }

  function isWorksListTab() {
    return currentTab === "all";
  }

  function isTrashTab() {
    return currentTab === "trash";
  }

  function isDocCategoryTab() {
    return ["perf", "rehearsal", "rule"].includes(currentTab);
  }

  function docTitleFromFilename(filename) {
    const base = (filename || "").replace(/\.[^.]+$/, "").trim();
    return base || "未命名资料";
  }

  function getAdminChoirId() {
    const sel = document.getElementById("adminChoirSelect");
    if (!sel?.value) return null;
    const cid = parseInt(sel.value, 10);
    return Number.isFinite(cid) ? cid : null;
  }

  /** 当前操作使用的 choir_id；仅多团时从下拉读取 */
  function effectiveChoirId() {
    if (choirContextMultiple) return getAdminChoirId();
    if (currentUser?.choir_id) return currentUser.choir_id;
    if (choirContexts.length === 1) return choirContexts[0].choir_id;
    return null;
  }

  function requireChoirIdForWrite() {
    const cid = effectiveChoirId();
    if (!cid) {
      toast(
        choirContextMultiple ? "请先选择所属团" : "当前账号未绑定合唱团，无法操作"
      );
      return null;
    }
    return cid;
  }

  function appendChoirIdParam(params) {
    const cid = effectiveChoirId();
    if (choirContextMultiple && cid) params.set("choir_id", String(cid));
    return cid;
  }

  function workNameFromPdfFilename(filename) {
    const base = (filename || "").replace(/\.[^.]+$/, "").trim();
    return base || "未命名作品";
  }

  function workEntryHref(w) {
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
    const trashMode = isTrashTab();
    const actions = document.getElementById("listTabActions");
    const stats = document.getElementById("docsStatsRow");
    const subFilters = document.getElementById("scoreFilters");
    const worksHead = document.getElementById("worksTableHeadRow");
    const trashHead = document.getElementById("trashTableHeadRow");
    const docsHead = document.getElementById("docsTableHeadRow");
    const cardTitle = document.getElementById("listCardTitle");
    const search = document.getElementById("searchInput");
    const searchBar = document.getElementById("searchBar");
    const trashHint = document.getElementById("trashHint");
    const tabTrash = document.getElementById("tabTrash");

    if (tabTrash) tabTrash.hidden = !canManageTrash();
    if (searchBar) searchBar.hidden = trashMode;
    if (actions) actions.hidden = trashMode || !canWrite();
    if (trashMode) {
      searchKeyword = "";
      if (search) search.value = "";
    }
    if (stats) stats.hidden = worksMode || trashMode;
    if (subFilters) subFilters.style.display = "none";
    if (worksHead) worksHead.hidden = !worksMode;
    if (trashHead) trashHead.hidden = !trashMode;
    if (docsHead) docsHead.hidden = worksMode || trashMode;
    if (trashHint) trashHint.style.display = trashMode ? "block" : "none";
    if (cardTitle) {
      cardTitle.textContent = trashMode
        ? "回收站"
        : worksMode
          ? "作品列表"
          : TAB_META[currentTab]?.listTitle || "资料列表";
    }
    if (search && !trashMode) {
      search.placeholder = worksMode
        ? "搜索作品名称、作曲者..."
        : currentTab === "rule"
          ? "搜索图文档案名称..."
          : "搜索资料名称、合集、风格、分类...";
    }
    syncDocFileInputs();
  }

  async function loadChoirContextSelector() {
    const wrap = document.getElementById("adminChoirWrap");
    const sel = document.getElementById("adminChoirSelect");
    choirContexts = [];
    choirContextMultiple = false;
    choirs = [];
    if (!wrap || !sel) return;
    wrap.hidden = true;
    const data = await ChoirAPI.get("/auth/choir-contexts");
    choirContexts = data.choirs || [];
    choirContextMultiple = !!data.multiple;
    choirs = choirContexts;
    if (!choirContextMultiple) return;
    wrap.hidden = false;
    sel.innerHTML = choirContexts
      .map((c) => `<option value="${c.choir_id}">${esc(c.choir_name)}</option>`)
      .join("");
    const saved = sessionStorage.getItem(ADMIN_CHOIR_KEY);
    if (saved && choirContexts.some((c) => String(c.choir_id) === saved)) {
      sel.value = saved;
    } else if (
      currentUser?.choir_id &&
      choirContexts.some((c) => c.choir_id === currentUser.choir_id)
    ) {
      sel.value = String(currentUser.choir_id);
    }
    sel.onchange = () => {
      sessionStorage.setItem(ADMIN_CHOIR_KEY, sel.value);
      reloadList().catch((e) => toast(e.message || "加载失败"));
    };
  }

  async function reloadList() {
    if (isTrashTab()) await loadTrash();
    else if (isWorksListTab()) await loadWorks();
    else await loadDocs();
  }

  async function loadTrash() {
    let path = "/works/trash";
    if (choirContextMultiple) {
      const cid = effectiveChoirId();
      if (!cid) {
        trashWorks = [];
        renderTrash();
        return;
      }
      path += `?choir_id=${cid}`;
    }
    const data = await ChoirAPI.get(path);
    trashWorks = data.works || [];
    trashRetentionDays = data.retention_days || 7;
    renderTrash();
  }

  function filterTrashList() {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return trashWorks;
    return trashWorks.filter(
      (w) =>
        (w.name || "").toLowerCase().includes(q) ||
        (w.composer || "").toLowerCase().includes(q)
    );
  }

  function renderTrash() {
    const list = filterTrashList();
    const countEl = document.getElementById("docCount");
    if (countEl) countEl.textContent = "共 " + list.length + " 个";
    const body = document.getElementById("docTableBody");
    if (!body) return;
    if (!list.length) {
      body.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">回收站为空</td></tr>';
      return;
    }
    body.innerHTML = list
      .map((w) => {
        const purgeLabel = w.purge_eligible
          ? "可清理"
          : `约 ${w.days_until_purge || trashRetentionDays} 天后`;
        let actions =
          '<button type="button" class="doc-action-btn" data-restore="' +
          w.work_id +
          '">恢复</button> ';
        if (w.purge_eligible) {
          actions +=
            '<button type="button" class="doc-action-btn" style="color:var(--cinnabar)" data-purge="' +
            w.work_id +
            '">永久删除</button>';
        }
        return (
          "<tr>" +
          "<td>" +
          esc(w.name) +
          "</td>" +
          "<td>" +
          esc(w.composer || "—") +
          "</td>" +
          "<td>" +
          (w.doc_count || 0) +
          "</td>" +
          "<td>" +
          formatDate(w.deleted_at) +
          "</td>" +
          "<td>" +
          purgeLabel +
          "</td>" +
          '<td style="display:flex;flex-wrap:wrap;gap:4px;">' +
          actions +
          "</td></tr>"
        );
      })
      .join("");
    body.querySelectorAll("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", () => restoreWork(parseInt(btn.dataset.restore, 10)));
    });
    body.querySelectorAll("[data-purge]").forEach((btn) => {
      btn.addEventListener("click", () =>
        purgeWorkPermanent(parseInt(btn.dataset.purge, 10))
      );
    });
  }

  async function deleteWork(workId, workName) {
    const msg =
      `确定将作品「${workName || ""}」移入回收站？\n` +
      `将同时隐藏该作品下的全部资料（歌谱、伴奏等），保留 ${trashRetentionDays} 天后可永久清理。`;
    if (!(await ChoirDialog.confirm(msg, "移入回收站"))) return;
    try {
      await ChoirAPI.del(`/works/${workId}`);
      await loadWorks();
      toast("已移入回收站");
    } catch (e) {
      toast(e.message || "删除失败");
    }
  }

  async function restoreWork(workId) {
    if (!(await ChoirDialog.confirm("确定恢复该作品及全部资料？", "恢复作品"))) return;
    try {
      await ChoirAPI.post(`/works/${workId}/restore`, {});
      await loadTrash();
      toast("已恢复");
    } catch (e) {
      toast(e.message || "恢复失败");
    }
  }

  async function purgeWorkPermanent(workId) {
    if (
      !(await ChoirDialog.confirm(
        "永久删除后无法恢复，将清除作品及全部资料文件。确定继续？",
        "永久删除"
      ))
    ) {
      return;
    }
    try {
      await ChoirAPI.del(`/works/${workId}/permanent`);
      await loadTrash();
      toast("已永久删除");
    } catch (e) {
      toast(e.message || "清理失败");
    }
  }

  async function loadWorks() {
    let path = "/works?include_recordings=0";
    if (choirContextMultiple) {
      const cid = effectiveChoirId();
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
        '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">暂无作品，可点击「新建」或「导入」批量添加 PDF 歌谱</td></tr>';
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
          "</tr>"
        );
      })
      .join("");
  }

  function closeNewWorkModal() {
    const modal = document.getElementById("newWorkModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    const errEl = document.getElementById("newWorkError");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    const confirmBtn = document.getElementById("newWorkConfirm");
    const cancelBtn = document.getElementById("newWorkCancel");
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }

  function openNewWorkModal() {
    const choirId = requireChoirIdForWrite();
    if (!choirId) return;
    const modal = document.getElementById("newWorkModal");
    const nameInput = document.getElementById("newWorkName");
    const composerInput = document.getElementById("newWorkComposer");
    if (!modal || !nameInput) {
      toast("页面组件未加载完整，请强制刷新后重试");
      return;
    }
    nameInput.value = "";
    if (composerInput) composerInput.value = "";
    const errEl = document.getElementById("newWorkError");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    nameInput.focus();
  }

  async function submitNewWork() {
    const choirId = requireChoirIdForWrite();
    if (!choirId) return;
    const nameInput = document.getElementById("newWorkName");
    const composerInput = document.getElementById("newWorkComposer");
    const errEl = document.getElementById("newWorkError");
    const name = (nameInput?.value || "").trim();
    const composer = (composerInput?.value || "").trim();
    if (!name) {
      if (errEl) {
        errEl.textContent = "请输入作品名称";
        errEl.hidden = false;
      }
      nameInput?.focus();
      return;
    }
    const confirmBtn = document.getElementById("newWorkConfirm");
    const cancelBtn = document.getElementById("newWorkCancel");
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    const body = { name: name.slice(0, 100), composer: composer.slice(0, 50) };
    if (choirContextMultiple) body.choir_id = choirId;
    try {
      const res = await ChoirAPI.post("/works", body);
      closeNewWorkModal();
      await loadWorks();
      if (res.work_id) navigateToWork(res);
    } catch (e) {
      const msg = e.message || "创建失败";
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
      toast(msg);
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  function createWork() {
    openNewWorkModal();
  }

  function openPdfImport() {
    if (!canWrite()) return;
    document.getElementById("importPdfInput")?.click();
  }

  function handleTabImport() {
    if (!canWrite()) return;
    if (isWorksListTab()) openPdfImport();
    else if (isDocCategoryTab()) document.getElementById("importDocInput")?.click();
  }

  function handleTabNew() {
    if (!canWrite()) return;
    if (isWorksListTab()) createWork();
    else if (isDocCategoryTab()) openNewDoc();
  }

  async function uploadChoirDocument(file, title, docType) {
    const choirId = requireChoirIdForWrite();
    if (!choirId) return null;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", (title || file.name || "未命名").slice(0, 200));
    fd.append("doc_type", docType);
    const meta = TAB_META[docType];
    if (meta?.category) fd.append("category", meta.category);
    if (choirContextMultiple) fd.append("choir_id", String(choirId));
    return ChoirAPI.postForm("/documents/upload", fd);
  }

  function closeImportDocModal() {
    const modal = document.getElementById("importDocModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    pendingDocImportFiles = [];
    pendingDocImportType = "";
    const tbody = document.getElementById("importDocRows");
    if (tbody) tbody.innerHTML = "";
    const status = document.getElementById("importDocStatus");
    if (status) status.textContent = "";
    const confirmBtn = document.getElementById("importDocConfirm");
    const cancelBtn = document.getElementById("importDocCancel");
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }

  function showImportDocModal(fileList) {
    let files = Array.from(fileList || []).filter((f) => f && f.name);
    files = filterFilesForCurrentTab(files);
    if (!files.length) {
      toast(
        currentTab === "rule"
          ? "请选择图文档案文件（PDF、Word、Excel、PPT、图片等）"
          : "请选择要导入的文件"
      );
      return;
    }
    if (!requireChoirIdForWrite()) return;

    pendingDocImportFiles = files;
    pendingDocImportType = currentTab;
    const label = tabImportLabel(currentTab);
    const titleEl = document.getElementById("importDocModalTitle");
    const hintEl = document.getElementById("importDocModalHint");
    if (titleEl) titleEl.textContent = `批量导入${label}`;
    if (hintEl) {
      hintEl.textContent =
        currentTab === "rule"
          ? "每个文件将作为规章制度下的图文档案上传，可在下方修改显示名称。"
          : `每个文件将上传为「${label}」，可在下方修改显示名称。`;
    }

    const tbody = document.getElementById("importDocRows");
    const modal = document.getElementById("importDocModal");
    if (!tbody || !modal) {
      toast("页面组件未加载完整，请强制刷新后重试");
      return;
    }
    tbody.innerHTML = files
      .map(
        (file, i) =>
          "<tr>" +
          '<td class="import-file" title="' +
          esc(file.name) +
          '">' +
          esc(file.name) +
          "</td>" +
          '<td><input type="text" class="import-name-input" data-doc-idx="' +
          i +
          '" value="' +
          esc(docTitleFromFilename(file.name).slice(0, 200)) +
          '" maxlength="200"/></td>' +
          "</tr>"
      )
      .join("");

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    tbody.querySelector(".import-name-input")?.focus();
  }

  async function confirmDocImport() {
    const choirId = requireChoirIdForWrite();
    if (!choirId || !pendingDocImportType) return;

    const inputs = document.querySelectorAll("#importDocRows .import-name-input");
    const entries = [];
    inputs.forEach((input) => {
      const idx = parseInt(input.dataset.docIdx, 10);
      const file = pendingDocImportFiles[idx];
      if (!file) return;
      const title =
        (input.value || "").trim() || docTitleFromFilename(file.name);
      entries.push({ file, title: title.slice(0, 200) });
    });
    if (!entries.length) return;

    const confirmBtn = document.getElementById("importDocConfirm");
    const cancelBtn = document.getElementById("importDocCancel");
    const status = document.getElementById("importDocStatus");
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    let ok = 0;
    const errors = [];
    for (let i = 0; i < entries.length; i++) {
      const { file, title } = entries[i];
      if (status) status.textContent = `导入中 ${i + 1}/${entries.length}…`;
      try {
        await uploadChoirDocument(file, title, pendingDocImportType);
        ok += 1;
      } catch (e) {
        errors.push(`${file.name}: ${e.message || "失败"}`);
      }
    }

    const typeLabel = tabImportLabel(pendingDocImportType);
    closeImportDocModal();
    await loadDocs();
    if (errors.length && ok) {
      toast(`成功 ${ok} 个，失败 ${errors.length} 个：\n` + errors.slice(0, 5).join("\n"));
    } else if (errors.length) {
      toast("导入失败：\n" + errors.slice(0, 8).join("\n"));
    } else {
      toast(`已成功导入 ${ok} 个${typeLabel}`);
    }
  }

  async function openNewDoc() {
    const choirId = requireChoirIdForWrite();
    if (!choirId) return;
    const label = tabImportLabel(currentTab);
    const data = await ChoirDialog.form({
      title: `新建${label}`,
      fields: [
        {
          key: "title",
          label: currentTab === "rule" ? "档案名称" : "资料名称",
          required: true,
          maxlength: 200,
        },
      ],
    });
    if (!data) return;
    const title = (data.title || "").trim();
    if (!title) {
      toast(currentTab === "rule" ? "请输入档案名称" : "请输入资料名称");
      return;
    }
    pendingNewDocTitle = title;
    syncDocFileInputs();
    document.getElementById("newDocFileInput")?.click();
  }

  async function onNewDocFileSelected(fileList) {
    let file = (fileList && fileList[0]) || null;
    const input = document.getElementById("newDocFileInput");
    if (input) input.value = "";
    const title = pendingNewDocTitle;
    pendingNewDocTitle = "";
    if (!file) {
      if (title) toast("未选择文件，已取消");
      return;
    }
    if (!title) return;
    if (currentTab === "rule" && !isRuleArchiveFile(file)) {
      toast("请选择图文档案文件（PDF、Word、Excel、PPT、图片等）");
      return;
    }
    try {
      await uploadChoirDocument(file, title, currentTab);
      await loadDocs();
      toast("已上传");
    } catch (e) {
      toast(e.message || "上传失败");
    }
  }

  function closeImportModal() {
    const modal = document.getElementById("importPdfModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    pendingImportFiles = [];
    const tbody = document.getElementById("importPdfRows");
    if (tbody) tbody.innerHTML = "";
    const status = document.getElementById("importStatus");
    if (status) status.textContent = "";
    const confirmBtn = document.getElementById("importPdfConfirm");
    const cancelBtn = document.getElementById("importPdfCancel");
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }

  function showImportModal(fileList) {
    const pdfs = Array.from(fileList || []).filter((f) =>
      (f.name || "").toLowerCase().endsWith(".pdf")
    );
    if (!pdfs.length) {
      toast("请选择 PDF 歌谱文件");
      return;
    }
    if (!requireChoirIdForWrite()) return;

    pendingImportFiles = pdfs;
    const tbody = document.getElementById("importPdfRows");
    const modal = document.getElementById("importPdfModal");
    if (!tbody || !modal) {
      toast("页面组件未加载完整，请强制刷新后重试（Ctrl+Shift+R）");
      return;
    }
    tbody.innerHTML = pdfs
      .map(
        (file, i) =>
          "<tr>" +
          '<td class="import-file" title="' +
          esc(file.name) +
          '">' +
          esc(file.name) +
          "</td>" +
          '<td><input type="text" class="import-name-input" data-idx="' +
          i +
          '" value="' +
          esc(workNameFromPdfFilename(file.name).slice(0, 100)) +
          '" maxlength="100"/></td>' +
          "</tr>"
      )
      .join("");

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    tbody.querySelector(".import-name-input")?.focus();
  }

  async function renameWork(workId, currentName) {
    const name = await ChoirDialog.prompt({
      title: "修改作品名称",
      label: "作品名称",
      value: currentName || "",
      required: true,
      maxlength: 100,
    });
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast("作品名称不能为空");
      return;
    }
    try {
      await ChoirAPI.patch(`/works/${workId}`, { name: trimmed });
      await loadWorks();
    } catch (e) {
      toast(e.message || "保存失败");
    }
  }

  async function confirmPdfImport() {
    const choirId = requireChoirIdForWrite();
    if (!choirId) return;

    const inputs = document.querySelectorAll("#importPdfRows .import-name-input");
    const entries = [];
    inputs.forEach((input) => {
      const idx = parseInt(input.dataset.idx, 10);
      const file = pendingImportFiles[idx];
      if (!file) return;
      const name =
        (input.value || "").trim() || workNameFromPdfFilename(file.name);
      entries.push({ file, name: name.slice(0, 100) });
    });
    if (!entries.length) return;

    const confirmBtn = document.getElementById("importPdfConfirm");
    const cancelBtn = document.getElementById("importPdfCancel");
    const status = document.getElementById("importStatus");
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    let ok = 0;
    let lastImportedWork = null;
    const errors = [];
    for (let i = 0; i < entries.length; i++) {
      const { file, name } = entries[i];
      if (status) status.textContent = `导入中 ${i + 1}/${entries.length}…`;
      try {
        const body = { name, composer: "" };
        if (choirContextMultiple) body.choir_id = choirId;
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

    closeImportModal();
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
    if (choirContextMultiple) {
      const cid = appendChoirIdParam(p);
      if (!cid) {
        docs = [];
        renderDocs();
        return;
      }
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
        '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">' +
        (currentTab === "rule"
          ? "暂无图文档案，可点击搜索栏右侧「新建」或「导入」"
          : "暂无资料，可点击搜索栏右侧「新建」或「导入」") +
        "</td></tr>";
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
        ChoirDialog.openVideo(btn.dataset.playVideo, btn.dataset.title);
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
        if (!(await ChoirDialog.confirm("确定删除该资料？", "删除资料"))) return;
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
    updateListChrome();

    document.getElementById("btnTabNew")?.addEventListener("click", handleTabNew);
    document.getElementById("btnTabImport")?.addEventListener("click", handleTabImport);

    document.getElementById("newWorkCancel")?.addEventListener("click", closeNewWorkModal);
    document.getElementById("newWorkConfirm")?.addEventListener("click", () => {
      submitNewWork().catch((e) => toast(e.message || "创建失败"));
    });
    document.getElementById("newWorkForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      submitNewWork().catch((err) => toast(err.message || "创建失败"));
    });
    document.getElementById("newWorkModal")?.addEventListener("click", (e) => {
      if (e.target.id === "newWorkModal") closeNewWorkModal();
    });

    const importInput = document.getElementById("importPdfInput");
    if (importInput) {
      importInput.addEventListener("change", () => {
        const files = Array.from(importInput.files || []);
        importInput.value = "";
        if (files.length) showImportModal(files);
      });
    }

    document.getElementById("importPdfCancel")?.addEventListener("click", closeImportModal);
    document.getElementById("importPdfConfirm")?.addEventListener("click", () => {
      confirmPdfImport().catch((e) => toast(e.message || "导入失败"));
    });
    document.getElementById("importPdfModal")?.addEventListener("click", (e) => {
      if (e.target.id === "importPdfModal") closeImportModal();
    });

    const importDocInput = document.getElementById("importDocInput");
    if (importDocInput) {
      importDocInput.addEventListener("change", () => {
        const files = Array.from(importDocInput.files || []);
        importDocInput.value = "";
        if (files.length) showImportDocModal(files);
      });
    }
    document.getElementById("importDocCancel")?.addEventListener("click", closeImportDocModal);
    document.getElementById("importDocConfirm")?.addEventListener("click", () => {
      confirmDocImport().catch((e) => toast(e.message || "导入失败"));
    });
    document.getElementById("importDocModal")?.addEventListener("click", (e) => {
      if (e.target.id === "importDocModal") closeImportDocModal();
    });

    const newDocFileInput = document.getElementById("newDocFileInput");
    if (newDocFileInput) {
      newDocFileInput.addEventListener("change", () => {
        const files = newDocFileInput.files;
        onNewDocFileSelected(files).catch((e) => toast(e.message || "上传失败"));
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
        if (isTrashTab()) renderTrash();
        else if (isWorksListTab()) renderWorks();
        else loadDocs();
      });
    }

    await loadChoirContextSelector();
    await reloadList();
  }

  function applyMobileSidebarLayout() {
    const sidebar = document.querySelector(".page-body > .sidebar");
    if (!sidebar) return;
    const mq = window.matchMedia("(max-width: 1200px)");
    const sync = () => {
      sidebar.hidden = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyMobileSidebarLayout();
    ChoirUI.initUserDropdown();
    ChoirAppShell.init();
    init().catch((e) => {
      console.error(e);
      if (e.message !== "未登录") toast(e.message || "加载失败");
    });
  });
})();
