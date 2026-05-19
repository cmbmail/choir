/**
 * 项目管理：编年纪类型、流水账、进度、待办；完成后摘要与项目资料（影视/图/文）
 */
(function () {
  const ADMIN_CHOIR_KEY = "choir_admin_selected_choir_id";
  const STATUS_LABELS = {
    in_progress: "进行中",
    completed: "已完成",
    cancelled: "已取消",
  };

  let currentUser = null;
  let projects = [];
  let meta = { years: [], category_types: [], default_types: [] };
  let selectedId = null;
  let detail = null;
  let filterYear = "";
  let filterType = "all";
  let filterStatus = "all";
  let searchQ = "";
  let assetTab = "video";

  const ASSET_ACCEPT = {
    video: ".mp4,.mov,.webm,.mkv,.m4v,.avi",
    image: ".jpg,.jpeg,.png,.gif,.webp,.bmp,.heic",
    text: ".pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.ppt,.pptx",
  };
  const ASSET_LABELS = { video: "影视", image: "图", text: "文" };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, isErr) {
    if (window.ChoirDialog) ChoirDialog.toast(msg, isErr);
    else if (isErr) console.error(msg);
    else console.log(msg);
  }

  function canWrite() {
    return (
      currentUser?.system_super_admin ||
      window.ChoirAuth.hasPermission(currentUser, "projects.write")
    );
  }

  function getAdminChoirId() {
    const sel = document.getElementById("adminChoirSelect");
    if (!sel?.value) return null;
    const cid = parseInt(sel.value, 10);
    return Number.isFinite(cid) ? cid : null;
  }

  function choirQuery() {
    if (!currentUser?.system_super_admin) return "";
    const cid = getAdminChoirId();
    return cid ? `choir_id=${cid}` : "";
  }

  function apiPath(path) {
    const q = choirQuery();
    if (!q) return path;
    return path + (path.includes("?") ? "&" : "?") + q;
  }

  async function loadChoirsForAdmin() {
    const wrap = document.getElementById("adminChoirWrap");
    const sel = document.getElementById("adminChoirSelect");
    if (!currentUser?.system_super_admin || !wrap || !sel) return;
    wrap.hidden = false;
    const data = await ChoirAPI.get("/choirs");
    const choirs = data.choirs || [];
    sel.innerHTML = choirs
      .map((c) => `<option value="${c.choir_id}">${esc(c.name)}</option>`)
      .join("");
    const saved = sessionStorage.getItem(ADMIN_CHOIR_KEY);
    if (saved && choirs.some((c) => String(c.choir_id) === saved)) sel.value = saved;
    sel.addEventListener("change", () => {
      sessionStorage.setItem(ADMIN_CHOIR_KEY, sel.value);
      selectedId = null;
      detail = null;
      reloadAll().catch((e) => toast(e.message || "加载失败", true));
    });
  }

  async function loadMeta() {
    const qs = choirQuery();
    if (currentUser?.system_super_admin && !qs) {
      meta = { years: [], category_types: [], default_types: ["演出", "排练", "采购", "行政", "其他"] };
      fillFilters();
      return;
    }
    meta = await ChoirAPI.get("/projects/meta" + (qs ? "?" + qs : ""));
    fillFilters();
  }

  function fillFilters() {
    const yearSel = document.getElementById("filterYear");
    const typeSel = document.getElementById("filterType");
    if (yearSel) {
      const y = new Date().getFullYear();
      const years = new Set([y, ...(meta.years || [])]);
      yearSel.innerHTML =
        '<option value="">全部年份</option>' +
        [...years]
          .sort((a, b) => b - a)
          .map((yr) => `<option value="${yr}">${yr} 年</option>`)
          .join("");
      if (filterYear) yearSel.value = filterYear;
    }
    if (typeSel) {
      const types = new Set([
        ...(meta.default_types || []),
        ...(meta.category_types || []),
      ]);
      typeSel.innerHTML =
        '<option value="all">全部类型</option>' +
        [...types]
          .map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)
          .join("");
      typeSel.value = filterType;
    }
  }

  async function loadProjects() {
    const parts = [];
    const qs = choirQuery();
    if (qs) parts.push(qs);
    if (filterYear) parts.push(`year=${filterYear}`);
    if (filterType && filterType !== "all") parts.push(`category_type=${encodeURIComponent(filterType)}`);
    if (filterStatus && filterStatus !== "all") parts.push(`status=${filterStatus}`);
    if (searchQ.trim()) parts.push(`q=${encodeURIComponent(searchQ.trim())}`);
    if (currentUser?.system_super_admin && !choirQuery()) {
      projects = [];
      selectedId = null;
      detail = null;
      renderList();
      renderDetail();
      return;
    }
    const data = await ChoirAPI.get("/projects" + (parts.length ? "?" + parts.join("&") : ""));
    projects = data.projects || [];
    await syncDefaultSelection();
  }

  /** 列表有数据时默认选中第一条（按 updated_at 降序，与 API 一致） */
  async function syncDefaultSelection() {
    if (!projects.length) {
      selectedId = null;
      detail = null;
      renderList();
      renderDetail();
      return;
    }
    const visible = selectedId && projects.some((p) => p.project_id === selectedId);
    if (!visible) {
      await selectProject(projects[0].project_id);
    } else {
      renderList();
    }
  }

  function renderList() {
    const el = document.getElementById("projectList");
    const count = document.getElementById("projectCount");
    if (count) count.textContent = `共 ${projects.length} 项`;
    if (!el) return;
    if (!projects.length) {
      el.innerHTML =
        '<p class="empty-hint">暂无事项，点击「新建事项」开始记录</p>';
      return;
    }
    el.innerHTML = projects
      .map((p) => {
        const active = p.project_id === selectedId ? " active" : "";
        const st = STATUS_LABELS[p.status] || p.status;
        return (
          `<button type="button" class="project-card${active}" data-id="${p.project_id}">` +
          `<div class="project-card-head"><span class="project-card-year">${p.year}</span>` +
          `<span class="project-card-type">${esc(p.category_type)}</span></div>` +
          `<div class="project-card-title">${esc(p.title)}</div>` +
          `<div class="project-card-meta">` +
          `<span class="status-${p.status}">${st}</span>` +
          `<span>结余 ¥${(p.balance || 0).toFixed(2)}</span>` +
          `<span>待办 ${p.todos_done || 0}/${p.todos_total || 0}</span>` +
          `</div></button>`
        );
      })
      .join("");
    el.querySelectorAll(".project-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectProject(parseInt(btn.dataset.id, 10)).catch((e) =>
          toast(e.message || "加载失败", true)
        );
      });
    });
  }

  async function selectProject(id) {
    selectedId = id;
    renderList();
    const data = await ChoirAPI.get(`/projects/${id}`);
    detail = data;
    renderDetail();
  }

  function renderDetail() {
    const panel = document.getElementById("projectDetail");
    const empty = document.getElementById("projectDetailEmpty");
    const layout = document.querySelector(".project-layout");
    if (!panel || !empty) return;
    if (!detail) {
      panel.hidden = true;
      empty.hidden = false;
      layout?.classList.remove("has-detail");
      return;
    }
    panel.hidden = false;
    empty.hidden = true;
    layout?.classList.add("has-detail");
    const p = detail;
    const completed = p.status === "completed";
    const write = canWrite() && !completed;
    const canEditSummary = canWrite() && completed;

    document.getElementById("detailTitle").textContent = p.title;
    document.getElementById("detailMeta").innerHTML =
      `<span>${p.year} 年</span><span>${esc(p.category_type)}</span>` +
      `<span class="status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>`;

    const sectionSummaryTop = document.getElementById("sectionSummaryTop");
    const sectionWorking = document.getElementById("sectionWorking");
    const sectionMaterials = document.getElementById("sectionMaterials");
    if (sectionSummaryTop) sectionSummaryTop.hidden = !completed;
    if (sectionWorking) sectionWorking.hidden = completed;
    if (sectionMaterials) sectionMaterials.hidden = !completed;

    const summaryTop = document.getElementById("detailSummaryTop");
    if (summaryTop) {
      summaryTop.value = p.summary || "";
      summaryTop.readOnly = !canEditSummary;
    }
    const btnSaveSummary = document.getElementById("btnSaveSummary");
    if (btnSaveSummary) btnSaveSummary.hidden = !canEditSummary;

    const progress = document.getElementById("detailProgress");
    if (progress) {
      progress.value = p.progress_note || "";
      progress.readOnly = !write;
    }
    document.getElementById("btnSaveProgress").hidden = !write;
    document.getElementById("btnComplete").hidden = !write;
    document.getElementById("btnDeleteProject").hidden = !canWrite();

    document.getElementById("ledgerIncome").textContent = `¥${(p.income_total || 0).toFixed(2)}`;
    document.getElementById("ledgerExpense").textContent = `¥${(p.expense_total || 0).toFixed(2)}`;
    document.getElementById("ledgerBalance").textContent = `¥${(p.balance || 0).toFixed(2)}`;

    const tbody = document.getElementById("txnBody");
    const txns = p.transactions || [];
    if (tbody) {
      tbody.innerHTML = txns.length
        ? txns
            .map((t) => {
              const sign = t.direction === "income" ? "+" : "-";
              const del =
                write && t.transaction_id
                  ? ` <button type="button" class="link-btn" data-del-txn="${t.transaction_id}">删除</button>`
                  : "";
              return (
                "<tr>" +
                `<td>${esc(t.txn_date)}</td>` +
                `<td>${t.direction === "income" ? "收入" : "支出"}</td>` +
                `<td class="col-amount">${sign}¥${Number(t.amount).toFixed(2)}</td>` +
                `<td>${esc(t.description || "—")}</td>` +
                `<td>${del}</td></tr>`
              );
            })
            .join("")
        : '<tr><td colspan="5" class="col-muted">暂无流水</td></tr>';
      tbody.querySelectorAll("[data-del-txn]").forEach((btn) => {
        btn.addEventListener("click", () =>
          deleteTxn(parseInt(btn.dataset.delTxn, 10))
        );
      });
    }
    document.getElementById("btnAddTxn").hidden = !write;

    const todoList = document.getElementById("todoList");
    const todos = p.todos || [];
    if (todoList) {
      todoList.innerHTML = todos.length
        ? todos
            .map((t) => {
              const checked = t.is_done ? " checked" : "";
              const del = write
                ? ` <button type="button" class="link-btn" data-del-todo="${t.todo_id}">删除</button>`
                : "";
              return (
                `<label class="todo-item${t.is_done ? " done" : ""}">` +
                `<input type="checkbox" data-todo="${t.todo_id}"${checked}${write ? "" : " disabled"}/>` +
                `<span>${esc(t.content)}</span>${del}</label>`
              );
            })
            .join("")
        : '<p class="col-muted">暂无待办</p>';
      todoList.querySelectorAll("input[data-todo]").forEach((cb) => {
        cb.addEventListener("change", () =>
          toggleTodo(parseInt(cb.dataset.todo, 10), cb.checked)
        );
      });
      todoList.querySelectorAll("[data-del-todo]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          deleteTodo(parseInt(btn.dataset.delTodo, 10));
        });
      });
    }
    document.getElementById("todoAddRow").hidden = !write;

    if (completed) renderMaterials(canWrite());
  }

  function renderMaterials(canEdit) {
    const tabs = document.getElementById("materialTabs");
    tabs?.querySelectorAll(".material-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.kind === assetTab);
    });
    const btnVideoUrl = document.getElementById("btnAddVideoUrl");
    if (btnVideoUrl) btnVideoUrl.hidden = assetTab !== "video" || !canEdit;
    const toolbar = document.getElementById("materialToolbar");
    if (toolbar) {
      toolbar.querySelector("#btnImportAsset")?.toggleAttribute("hidden", !canEdit);
    }

    const assets = (detail?.assets || []).filter((a) => a.media_kind === assetTab);
    const grid = document.getElementById("assetGrid");
    const empty = document.getElementById("assetEmpty");
    if (!grid) return;
    if (!assets.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = assets
      .map((a) => {
        const size =
          a.file_size > 0
            ? `${(a.file_size / 1024 / 1024).toFixed(1)} MB`
            : a.video_url
              ? "外链"
              : "";
        let open = "";
        if (a.video_url) {
          open = `<a href="${esc(a.video_url)}" target="_blank" rel="noopener">打开链接</a>`;
        } else if (a.stream_url) {
          open = `<a href="${esc(a.stream_url)}" target="_blank" rel="noopener">查看</a>`;
        }
        const del = canEdit
          ? ` <button type="button" class="link-btn" data-del-asset="${a.asset_id}">删除</button>`
          : "";
        return (
          `<article class="asset-card">` +
          `<div class="asset-card-title">${esc(a.title)}</div>` +
          `<div class="asset-card-meta">${esc(a.file_name || a.video_url || "—")}${size ? ` · ${size}` : ""}</div>` +
          `<div class="asset-card-actions">${open}${del}</div></article>`
        );
      })
      .join("");
    grid.querySelectorAll("[data-del-asset]").forEach((btn) => {
      btn.addEventListener("click", () =>
        deleteAsset(parseInt(btn.dataset.delAsset, 10))
      );
    });
  }

  async function uploadAssets(files) {
    if (!detail || !canWrite() || detail.status !== "completed") return;
    for (const file of files) {
      const title =
        (await ChoirDialog.prompt({
          title: `导入${ASSET_LABELS[assetTab] || "资料"}`,
          label: "资料标题",
          value: file.name.replace(/\.[^.]+$/, ""),
          maxlength: 200,
        })) || file.name;
      const fd = new FormData();
      fd.append("media_kind", assetTab);
      fd.append("title", title.trim() || file.name);
      fd.append("file", file);
      await ChoirAPI.postForm(`/projects/${detail.project_id}/assets`, fd);
    }
    await selectProject(detail.project_id);
    toast("已导入");
  }

  async function addVideoUrl() {
    if (!detail || !canWrite()) return;
    const data = await ChoirDialog.form({
      title: "添加视频链接",
      fields: [
        { key: "title", label: "标题", maxlength: 200 },
        { key: "video_url", label: "视频 URL", required: true, maxlength: 500 },
      ],
    });
    if (!data) return;
    const fd = new FormData();
    fd.append("media_kind", "video");
    fd.append("title", (data.title || "").trim() || "视频链接");
    fd.append("video_url", (data.video_url || "").trim());
    await ChoirAPI.postForm(`/projects/${detail.project_id}/assets`, fd);
    await selectProject(detail.project_id);
    toast("已添加");
  }

  async function deleteAsset(assetId) {
    if (!(await ChoirDialog.confirm("确定删除该资料？", "删除资料"))) return;
    await ChoirAPI.del(`/projects/${detail.project_id}/assets/${assetId}`);
    await selectProject(detail.project_id);
    toast("已删除");
  }

  async function saveSummary() {
    if (!detail || !canWrite() || detail.status !== "completed") return;
    const summary = document.getElementById("detailSummaryTop")?.value || "";
    detail = await ChoirAPI.patch(`/projects/${detail.project_id}`, { summary });
    toast("摘要已保存");
    renderDetail();
  }

  async function createProject() {
    if (!canWrite()) return;
    const y = new Date().getFullYear();
    const types = meta.default_types || ["演出", "排练", "采购", "行政", "其他"];
    const data = await ChoirDialog.form({
      title: "新建事项",
      hint: "按编年（年份）与类型归档，可在项目内记录流水与待办",
      fields: [
        { key: "title", label: "事项名称", required: true, maxlength: 200 },
        { key: "year", label: "年份", value: String(y), required: true, maxlength: 4 },
        {
          key: "category_type",
          label: "类型",
          type: "select",
          options: types.map((t) => ({ value: t, label: t })),
          value: types[0] || "其他",
        },
      ],
    });
    if (!data) return;
    const body = {
      title: (data.title || "").trim(),
      year: parseInt(data.year, 10),
      category_type: data.category_type || "其他",
    };
    if (currentUser.system_super_admin) {
      const cid = getAdminChoirId();
      if (!cid) {
        toast("请先选择所属合唱团", true);
        return;
      }
      body.choir_id = cid;
    }
    const res = await ChoirAPI.post("/projects", body);
    await reloadAll();
    await selectProject(res.project_id);
    toast("已创建");
  }

  async function saveProgress() {
    if (!detail || !canWrite()) return;
    const note = document.getElementById("detailProgress")?.value || "";
    detail = await ChoirAPI.patch(`/projects/${detail.project_id}`, {
      progress_note: note,
    });
    toast("进度已保存");
    await loadProjects();
    renderDetail();
  }

  async function addTransaction() {
    if (!detail || !canWrite()) return;
    const data = await ChoirDialog.form({
      title: "记一笔流水",
      fields: [
        {
          key: "direction",
          label: "方向",
          type: "select",
          options: [
            { value: "expense", label: "支出" },
            { value: "income", label: "收入" },
          ],
          value: "expense",
        },
        { key: "amount", label: "金额（元）", required: true, maxlength: 16 },
        {
          key: "txn_date",
          label: "日期",
          value: new Date().toISOString().slice(0, 10),
          maxlength: 10,
        },
        { key: "description", label: "说明（可选）", maxlength: 200 },
      ],
    });
    if (!data) return;
    const amount = parseFloat(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("请输入有效金额", true);
      return;
    }
    await ChoirAPI.post(`/projects/${detail.project_id}/transactions`, {
      direction: data.direction,
      amount,
      txn_date: data.txn_date || new Date().toISOString().slice(0, 10),
      description: data.description || "",
    });
    await selectProject(detail.project_id);
    await loadProjects();
    toast("已记账");
  }

  async function deleteTxn(txnId) {
    if (!(await ChoirDialog.confirm("确定删除该流水记录？", "删除流水"))) return;
    await ChoirAPI.del(`/projects/${detail.project_id}/transactions/${txnId}`);
    await selectProject(detail.project_id);
    await loadProjects();
  }

  async function addTodo() {
    if (!detail || !canWrite()) return;
    const content = await ChoirDialog.prompt({
      title: "添加待办",
      label: "待办内容",
      required: true,
      maxlength: 500,
    });
    if (content === null) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    await ChoirAPI.post(`/projects/${detail.project_id}/todos`, { content: trimmed });
    await selectProject(detail.project_id);
  }

  async function toggleTodo(todoId, done) {
    await ChoirAPI.patch(`/projects/${detail.project_id}/todos/${todoId}`, {
      is_done: done,
    });
    await selectProject(detail.project_id);
  }

  async function deleteTodo(todoId) {
    if (!(await ChoirDialog.confirm("确定删除该待办？", "删除待办"))) return;
    await ChoirAPI.del(`/projects/${detail.project_id}/todos/${todoId}`);
    await selectProject(detail.project_id);
  }

  async function completeProject() {
    if (!detail || !canWrite()) return;
    if (
      !(await ChoirDialog.confirm(
        "将标记项目为已完成，并自动生成摘要（可随后编辑）。确定继续？",
        "完成项目"
      ))
    ) {
      return;
    }
    detail = await ChoirAPI.post(`/projects/${detail.project_id}/complete`, {});
    renderDetail();
    await loadProjects();
    toast("项目已完成，摘要已生成");
  }

  async function deleteProject() {
    if (!(await ChoirDialog.confirm("确定删除该项目及全部流水、待办？", "删除项目"))) return;
    await ChoirAPI.del(`/projects/${detail.project_id}`);
    selectedId = null;
    detail = null;
    renderDetail();
    await loadProjects();
    toast("已删除");
  }

  async function reloadAll() {
    await loadMeta();
    await loadProjects();
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;
    window.ChoirPermissions.applyNavPermissions(currentUser);

    document.getElementById("btnNewProject")?.addEventListener("click", () =>
      createProject().catch((e) => toast(e.message || "创建失败", true))
    );
    document.getElementById("btnSaveProgress")?.addEventListener("click", () =>
      saveProgress().catch((e) => toast(e.message || "保存失败", true))
    );
    document.getElementById("btnAddTxn")?.addEventListener("click", () =>
      addTransaction().catch((e) => toast(e.message || "失败", true))
    );
    document.getElementById("btnAddTodo")?.addEventListener("click", () =>
      addTodo().catch((e) => toast(e.message || "失败", true))
    );
    document.getElementById("btnComplete")?.addEventListener("click", () =>
      completeProject().catch((e) => toast(e.message || "失败", true))
    );
    document.getElementById("btnDeleteProject")?.addEventListener("click", () =>
      deleteProject().catch((e) => toast(e.message || "删除失败", true))
    );
    document.getElementById("btnSaveSummary")?.addEventListener("click", () =>
      saveSummary().catch((e) => toast(e.message || "保存失败", true))
    );
    document.getElementById("materialTabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".material-tab");
      if (!btn?.dataset.kind) return;
      assetTab = btn.dataset.kind;
      renderMaterials(canWrite());
    });
    document.getElementById("btnImportAsset")?.addEventListener("click", () => {
      const input = document.getElementById("assetFileInput");
      if (!input) return;
      input.accept = ASSET_ACCEPT[assetTab] || "";
      input.value = "";
      input.click();
    });
    document.getElementById("assetFileInput")?.addEventListener("change", (e) => {
      const files = [...(e.target.files || [])];
      if (!files.length) return;
      uploadAssets(files).catch((err) => toast(err.message || "导入失败", true));
    });
    document.getElementById("btnAddVideoUrl")?.addEventListener("click", () =>
      addVideoUrl().catch((e) => toast(e.message || "失败", true))
    );

    document.getElementById("filterYear")?.addEventListener("change", (e) => {
      filterYear = e.target.value;
      loadProjects().catch((e) => toast(e.message || "加载失败", true));
    });
    document.getElementById("filterType")?.addEventListener("change", (e) => {
      filterType = e.target.value;
      loadProjects().catch((e) => toast(e.message || "加载失败", true));
    });
    document.getElementById("filterStatus")?.addEventListener("change", (e) => {
      filterStatus = e.target.value;
      loadProjects().catch((e) => toast(e.message || "加载失败", true));
    });
    document.getElementById("searchProject")?.addEventListener("input", (e) => {
      searchQ = e.target.value;
      loadProjects().catch((e) => toast(e.message || "加载失败", true));
    });

    if (!canWrite()) {
      document.getElementById("btnNewProject")?.setAttribute("hidden", "");
    }

    await loadChoirsForAdmin();
    await reloadAll();
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init({ requiredPerm: "projects.read" }).then((user) => {
      if (!user) return;
      init().catch((e) => {
        if (e.message !== "未登录") toast(e.message || "加载失败", true);
      });
    });
  });
})();
