/**
 * 作品详情 — 编辑作品、共享、上传/管理资料
 */
(function () {
  const DOC_TYPES = [
    { id: "score", label: "乐谱" },
    { id: "perf", label: "演出资料" },
    { id: "rehearsal", label: "排练资料" },
    { id: "video", label: "视频" },
    { id: "audio", label: "音频" },
    { id: "other", label: "其他" },
  ];

  let currentUser = null;
  let work = null;
  let docs = [];
  let shareTargets = [];
  let currentDocTab = "score";
  let allWorks = [];

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getWorkId() {
    const p = new URLSearchParams(window.location.search);
    return parseInt(p.get("work_id") || "0", 10);
  }

  function canWrite() {
    if (currentUser?.system_super_admin) return true;
    if (!work?.is_owner) return false;
    return window.ChoirAuth.hasPermission(currentUser, "documents.write");
  }

  function canShare() {
    return (
      currentUser?.system_super_admin ||
      (work?.is_owner && ["super_admin", "conductor"].includes(currentUser?.role_code))
    );
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

  async function loadWork(id) {
    work = await ChoirAPI.get(`/works/${id}`);
    document.title = (work.name || "作品") + " · 弦歌合唱团";
    if ($("workTitle")) $("workTitle").textContent = work.name || "";
    if ($("workComposer")) $("workComposer").textContent = work.composer || "—";
    if ($("workMeta")) {
      $("workMeta").textContent =
        (work.is_owner ? "本团作品" : "共享作品 · 来自 " + (work.owner_choir_name || "")) +
        " · 创建于 " +
        formatDate(work.created_at);
    }
    const editBtn = $("btnEditWork");
    const uploadBtn = $("btnUploadDoc");
    if (editBtn) editBtn.hidden = !canWrite();
    if (uploadBtn) uploadBtn.hidden = !canWrite();
    const sharePanel = $("sharePanel");
    if (sharePanel) sharePanel.hidden = !canShare();
  }

  async function loadDocs() {
    const id = getWorkId();
    const p = new URLSearchParams({ work_id: String(id) });
    if (currentDocTab !== "all") p.set("type", currentDocTab);
    const data = await ChoirAPI.get("/documents?" + p);
    docs = data.documents || [];
    renderDocs();
  }

  function renderDocs() {
    const body = $("docTableBody");
    const count = $("docCount");
    if (count) count.textContent = "共 " + docs.length + " 条";
    if (!body) return;
    if (!docs.length) {
      body.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">暂无资料，点击上传</td></tr>';
      return;
    }
    body.innerHTML = docs
      .map((d) => {
        const title = d.title || d.file_name || "未命名";
        let actions =
          d.doc_type === "score"
            ? `<a class="doc-action-btn" href="极简中式-乐谱详情.html?id=${d.document_id}">查看</a> `
            : "";
        if (d.stream_url) {
          actions += `<button type="button" class="doc-action-btn" data-play="${d.document_id}">播放</button> `;
        }
        if (canWrite()) {
          actions += `<button type="button" class="doc-action-btn" data-edit="${d.document_id}">编辑</button> `;
          actions += `<button type="button" class="doc-action-btn danger" data-del="${d.document_id}">删除</button>`;
        }
        return `<tr>
          <td>${esc(title)}</td>
          <td>${esc(d.doc_type)}</td>
          <td>${esc(d.uploader || "—")}</td>
          <td>${formatDate(d.created_at)}</td>
          <td>${formatSize(d.file_size)}</td>
          <td style="display:flex;flex-wrap:wrap;gap:4px">${actions}</td>
        </tr>`;
      })
      .join("");

    body.querySelectorAll("[data-play]").forEach((btn) => {
      btn.addEventListener("click", () => window.ChoirMedia.playDocument(btn.dataset.play));
    });
    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("确定删除？")) return;
        await ChoirAPI.del(`/documents/${btn.dataset.del}`);
        await loadDocs();
        await loadWork(getWorkId());
      });
    });
    body.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => editDocument(parseInt(btn.dataset.edit, 10)));
    });
  }

  async function editDocument(docId) {
    const d = docs.find((x) => x.document_id === docId);
    if (!d) return;
    const title = prompt("资料标题", d.title || "");
    if (title === null) return;
    const category = prompt("分类（可选）", d.category || "") ?? d.category;
    const style = prompt("风格（可选）", d.style || "") ?? d.style;
    const collection = prompt("合集（可选）", d.collection || "") ?? d.collection;

    let workId = d.work_id;
    if (allWorks.length === 0) {
      const wdata = await ChoirAPI.get("/works?include_recordings=0");
      allWorks = wdata.works || [];
    }
    const opts = allWorks
      .filter((w) => w.is_owner !== false)
      .map((w) => `${w.work_id}:${w.name}`)
      .join("\n");
    const pick = prompt(
      `所属作品 ID（留空取消关联）\n当前: ${d.work_id || "无"}\n可选:\n${opts}`,
      d.work_id ? String(d.work_id) : ""
    );
    if (pick === null) return;
    const body = {
      title: (title || d.title).trim(),
      category: category || null,
      style: style || null,
      collection_name: collection || null,
    };
    if (pick.trim() === "") body.work_id = null;
    else body.work_id = parseInt(pick.trim(), 10);

    try {
      await ChoirAPI.patch(`/documents/${docId}`, body);
      await loadDocs();
      alert("已保存");
    } catch (e) {
      alert(e.message || "保存失败");
    }
  }

  async function loadSharePanel() {
    if (!canShare()) return;
    try {
      const data = await ChoirAPI.get("/choirs/share-targets");
      shareTargets = data.choirs || [];
    } catch (e) {
      shareTargets = [];
    }
    const box = $("shareChoirList");
    if (!box) return;
    const selected = new Set(work.shared_choir_ids || []);
    box.innerHTML = shareTargets
      .map(
        (c) => `
      <label class="share-chk">
        <input type="checkbox" value="${c.choir_id}" ${selected.has(c.choir_id) ? "checked" : ""}/>
        ${esc(c.name)}
      </label>`
      )
      .join("");
  }

  async function saveShares() {
    const ids = [];
    document.querySelectorAll("#shareChoirList input:checked").forEach((el) => {
      ids.push(parseInt(el.value, 10));
    });
    try {
      await ChoirAPI.put(`/works/${work.work_id}/shares`, { choir_ids: ids });
      await loadWork(work.work_id);
      await loadSharePanel();
      alert("共享设置已保存");
    } catch (e) {
      alert(e.message || "保存失败");
    }
  }

  function bindDocTabs() {
    document.querySelectorAll(".doc-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".doc-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        currentDocTab = tab.dataset.type;
        loadDocs();
      });
    });
  }

  async function onUpload(file) {
    if (!file || !canWrite()) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", file.name);
    fd.append("doc_type", currentDocTab === "all" ? "other" : currentDocTab);
    fd.append("work_id", String(work.work_id));
    try {
      await ChoirAPI.postForm("/documents/upload", fd);
      await loadDocs();
      await loadWork(work.work_id);
      alert("上传成功");
    } catch (e) {
      alert(e.message || "上传失败");
    }
  }

  async function editWorkMeta() {
    const name = prompt("作品名称", work.name || "");
    if (!name || !name.trim()) return;
    const composer = prompt("作曲者", work.composer || "") ?? work.composer;
    try {
      work = await ChoirAPI.patch(`/works/${work.work_id}`, {
        name: name.trim(),
        composer: composer,
      });
      if ($("workTitle")) $("workTitle").textContent = work.name;
      if ($("workComposer")) $("workComposer").textContent = work.composer || "—";
    } catch (e) {
      alert(e.message || "保存失败");
    }
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;
    const id = getWorkId();
    if (!id) {
      alert("缺少作品 ID");
      window.location.href = "极简中式-作品管理.html";
      return;
    }
    window.ChoirPermissions.applyNavPermissions(currentUser);
    await loadWork(id);
    await loadSharePanel();
    bindDocTabs();

    $("btnEditWork")?.addEventListener("click", editWorkMeta);
    $("btnSaveShare")?.addEventListener("click", saveShares);

    const uploadBtn = $("btnUploadDoc");
    let input = $("docFileInput");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "docFileInput";
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        if (input.files[0]) onUpload(input.files[0]);
        input.value = "";
      });
    }
    uploadBtn?.addEventListener("click", () => input.click());

    await loadDocs();
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init();
    init().catch((e) => {
      if (e.message !== "未登录") alert(e.message || "加载失败");
    });
  });
})();
