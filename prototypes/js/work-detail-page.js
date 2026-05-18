/**
 * 作品详情 — 伴奏 / 献唱视频 / 歌谱 / 说明（分区上传，说明可多文件）
 */
(function () {
  const ASSET_SECTIONS = [
    {
      id: "accompaniment",
      label: "伴奏",
      hint: "音频文件，如 MP3、WAV",
      accept: "audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg",
      multiple: true,
    },
    {
      id: "performance_video",
      label: "献唱视频",
      hint: "视频文件，如 MP4、MOV",
      accept: "video/*,.mp4,.mov,.webm,.m4v",
      multiple: true,
    },
    {
      id: "score",
      label: "歌谱",
      hint: "PDF 或图片",
      accept: ".pdf,image/*,.jpg,.jpeg,.png,.webp",
      multiple: true,
    },
    {
      id: "notes",
      label: "说明",
      hint: "可上传多个文件（文稿、图片、PDF 等）",
      accept: "*",
      multiple: true,
    },
  ];

  const LEGACY_SECTION = {
    audio: "accompaniment",
    video: "performance_video",
    perf: "notes",
    rehearsal: "notes",
    other: "notes",
  };

  let currentUser = null;
  let work = null;
  let docs = [];
  let shareTargets = [];

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
    const raw = p.get("work_id") || p.get("id") || "0";
    return parseInt(raw, 10);
  }

  function sectionForDoc(d) {
    const t = (d.doc_type || "").toLowerCase();
    if (ASSET_SECTIONS.some((s) => s.id === t)) return t;
    return LEGACY_SECTION[t] || "notes";
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

  function isPlayable(d) {
    const mime = (d.mime_type || "").toLowerCase();
    const ext = (d.ext || "").toLowerCase();
    if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
    return ["mp3", "wav", "m4a", "aac", "mp4", "mov", "webm"].includes(ext);
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
    if (editBtn) editBtn.hidden = !canWrite();
    const sharePanel = $("sharePanel");
    if (sharePanel) sharePanel.hidden = !canShare();
  }

  async function loadDocs() {
    const root = $("workAssetSections");
    const id = getWorkId();
    if (root) {
      root.innerHTML = '<p class="asset-empty">正在加载资料…</p>';
    }
    try {
      const data = await ChoirAPI.get("/documents?" + new URLSearchParams({ work_id: String(id) }));
      docs = data.documents || [];
      renderSections();
    } catch (e) {
      docs = [];
      if (root) {
        root.innerHTML = `<p class="asset-empty" style="color:var(--error)">资料加载失败：${esc(e.message || "无权限")}</p>`;
      }
    }
  }

  function docsForSection(sectionId) {
    return docs.filter((d) => sectionForDoc(d) === sectionId);
  }

  async function downloadDocument(docId, fileName) {
    try {
      await window.ChoirMedia.downloadDocument(docId, fileName);
    } catch (e) {
      alert(e.message || "下载失败");
    }
  }

  function renderFileRow(d) {
    const title = d.title || d.file_name || "未命名";
    let actions = "";
    if (sectionForDoc(d) === "score") {
      actions += `<a class="asset-action" href="极简中式-乐谱详情.html?id=${d.document_id}">查看</a>`;
    }
    if (isPlayable(d)) {
      actions += `<button type="button" class="asset-action" data-play="${d.document_id}">播放</button>`;
    }
    if (canWrite()) {
      actions += `<button type="button" class="asset-action" data-edit="${d.document_id}">重命名</button>`;
      actions += `<button type="button" class="asset-action danger" data-del="${d.document_id}">删除</button>`;
    }
    actions =
      `<button type="button" class="asset-action asset-action-dl" data-dl="${d.document_id}">下载</button> ` +
      actions;
    return `<tr>
      <td>${esc(title)}</td>
      <td>${formatSize(d.file_size)}</td>
      <td>${formatDate(d.created_at)}</td>
      <td><div class="asset-file-actions">${actions}</div></td>
    </tr>`;
  }

  function renderSections() {
    const root = $("workAssetSections");
    if (!root) return;
    const write = canWrite();

    root.innerHTML = ASSET_SECTIONS.map((sec) => {
      const list = docsForSection(sec.id);
      const filesHtml = list.length
        ? `<div class="asset-download-panel" data-download-panel="${sec.id}">
            <div class="asset-download-title">下载清单</div>
            <div class="asset-download-scroll">
              <table class="asset-download-table">
                <thead><tr><th>文件名</th><th>大小</th><th>上传日期</th><th>操作</th></tr></thead>
                <tbody>${list.map(renderFileRow).join("")}</tbody>
              </table>
            </div>
          </div>`
        : `<div class="asset-empty">暂无${esc(sec.label)}</div>`;
      const uploadBtn = write
        ? `<button type="button" class="btn btn-outline asset-upload-btn" data-upload="${sec.id}">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            上传${esc(sec.label)}${sec.multiple ? "（可多选）" : ""}
          </button>`
        : "";
      return `<section class="asset-section" data-section="${sec.id}">
        <div class="asset-section-head">
          <h2 class="asset-section-title">${esc(sec.label)}</h2>
          <span class="asset-section-count">${list.length} 个文件</span>
        </div>
        <p class="asset-section-hint">${esc(sec.hint)}</p>
        ${uploadBtn}
        ${filesHtml}
      </section>`;
    }).join("");

    root.querySelectorAll("[data-dl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const docId = parseInt(btn.dataset.dl, 10);
        const doc = docs.find((x) => x.document_id === docId);
        downloadDocument(docId, doc?.file_name || doc?.title || "download");
      });
    });
    root.querySelectorAll("[data-play]").forEach((btn) => {
      btn.addEventListener("click", () => window.ChoirMedia.playDocument(btn.dataset.play));
    });
    root.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("确定删除该文件？")) return;
        await ChoirAPI.del(`/documents/${btn.dataset.del}`);
        await loadDocs();
        await loadWork(getWorkId());
      });
    });
    root.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => renameDocument(parseInt(btn.dataset.edit, 10)));
    });
    root.querySelectorAll("[data-upload]").forEach((btn) => {
      btn.addEventListener("click", () => openUpload(btn.dataset.upload));
    });
  }

  function openUpload(sectionId) {
    const sec = ASSET_SECTIONS.find((s) => s.id === sectionId);
    if (!sec || !canWrite()) return;
    let input = document.querySelector(`input[data-file-input="${sectionId}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.hidden = true;
      input.dataset.fileInput = sectionId;
      input.accept = sec.accept;
      if (sec.multiple) input.multiple = true;
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        const files = Array.from(input.files || []);
        input.value = "";
        if (files.length) uploadFiles(sectionId, files);
      });
    }
    input.accept = sec.accept;
    input.multiple = !!sec.multiple;
    input.click();
  }

  async function uploadFiles(sectionId, files) {
    let ok = 0;
    let lastErr = null;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      fd.append("doc_type", sectionId);
      fd.append("work_id", String(work.work_id));
      try {
        await ChoirAPI.postForm("/documents/upload", fd);
        ok += 1;
      } catch (e) {
        lastErr = e;
      }
    }
    await loadDocs();
    await loadWork(work.work_id);
    const panel = document.querySelector(`[data-download-panel="${sectionId}"]`);
    if (panel && ok) {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      panel.classList.add("asset-download-panel--highlight");
      setTimeout(() => panel.classList.remove("asset-download-panel--highlight"), 2400);
    }
    if (ok && !lastErr) {
      alert(ok > 1 ? `已上传 ${ok} 个文件，见下方下载清单` : "上传成功，见下方下载清单");
    } else if (ok && lastErr) {
      alert(`部分成功：${ok} 个已上传；失败：${lastErr.message || "未知错误"}`);
    } else if (lastErr) {
      alert(lastErr.message || "上传失败");
    }
  }

  async function renameDocument(docId) {
    const d = docs.find((x) => x.document_id === docId);
    if (!d) return;
    const title = prompt("显示名称", d.title || d.file_name || "");
    if (title === null || !title.trim()) return;
    try {
      await ChoirAPI.patch(`/documents/${docId}`, { title: title.trim() });
      await loadDocs();
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
      window.location.href = "极简中式-资料管理.html";
      return;
    }
    window.ChoirPermissions.applyNavPermissions(currentUser);
    await loadWork(id);
    await loadSharePanel();
    $("btnEditWork")?.addEventListener("click", editWorkMeta);
    $("btnSaveShare")?.addEventListener("click", saveShares);
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
