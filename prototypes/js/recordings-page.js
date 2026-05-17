/**
 * 录音管理 — /api/works、/api/recordings
 */
(function () {
  const PART_NAMES = {
    1: "女高音（S）",
    2: "女低音（A）",
    3: "男高音（T）",
    4: "男低音（B）",
    5: "声部五",
    6: "声部六",
    7: "声部七",
    8: "声部八",
  };

  let currentUser = null;
  let works = [];

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function canWrite() {
    return (
      currentUser?.system_super_admin ||
      window.ChoirAuth.hasPermission(currentUser, "recordings.write")
    );
  }

  function formatDate(iso) {
    if (!iso) return "—";
    return iso.slice(0, 10);
  }

  function getStatus(work) {
    const recs = work.recordings || [];
    if (!recs.length) return "empty";
    const allParts = [1, 2, 3, 4, 5, 6, 7, 8];
    const uploaded = new Set();
    recs.forEach((r) => (r.parts || []).forEach((p) => uploaded.add(Number(p))));
    if (allParts.every((p) => uploaded.has(p))) return "complete";
    return "partial";
  }

  function statusHtml(status) {
    const map = { complete: "已完成", partial: "部分上传", empty: "未上传" };
    const color = {
      complete: "var(--success)",
      partial: "var(--warning)",
      empty: "var(--text-muted)",
    };
    return `<span style="color:${color[status]};font-size:0.7rem;">${map[status]}</span>`;
  }

  function renderWorks(list) {
    const container = document.getElementById("workList");
    if (!container) return;
    if (!list.length) {
      container.innerHTML =
        '<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg><p>暂无作品</p><p class="hint">点击「新建作品」开始添加</p></div>';
      return;
    }

    container.innerHTML = list
      .map((w) => {
        const id = w.work_id;
        const recs = w.recordings || [];
        const status = getStatus(w);
        const recsHtml = recs.length
          ? recs
              .map(
                (r) => `
          <div class="recording-item">
            <div class="recording-info">
              <div class="recording-name">${esc(r.name)}</div>
              <div class="recording-date">上传日期: ${formatDate(r.created_at)}</div>
              <div class="recording-parts">
                ${(r.parts || [])
                  .map(
                    (p) =>
                      `<span class="part-tag">${esc(PART_NAMES[p] || "声部" + p)}</span>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="recording-actions">
              <button type="button" class="recording-action-btn play-btn" data-play="${r.recording_id}">
                <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                播放
              </button>
              ${
                canWrite()
                  ? `<button type="button" class="recording-action-btn danger" data-del-rec="${r.recording_id}">删除</button>`
                  : ""
              }
            </div>
          </div>`
              )
              .join("")
          : '<div class="empty-state" style="padding:1.5rem;"><p style="font-size:0.8rem;">暂无录音</p></div>';

        const uploadBlock = canWrite()
          ? `<div class="upload-section">
              <button type="button" class="upload-btn" data-upload-work="${id}">
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                上传录音
              </button>
            </div>`
          : "";

        return `
        <div class="work-card" id="work-${id}">
          <div class="work-card-header" data-toggle-work="${id}">
            <div class="work-info">
              <div class="work-name">${esc(w.name)}</div>
              <div class="work-meta">
                <span class="work-meta-item">${esc(w.composer || "—")}</span>
                <span class="work-meta-item">${formatDate(w.created_at)}</span>
                <span class="work-meta-item">录音数: ${recs.length}</span>
                <span class="work-meta-item">${statusHtml(status)}</span>
              </div>
            </div>
            <div class="work-toggle" id="toggle-${id}">
              <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div class="work-card-body" id="body-${id}">
            <div class="recording-list">${recsHtml}</div>
            ${uploadBlock}
          </div>
        </div>`;
      })
      .join("");

    container.querySelectorAll("[data-toggle-work]").forEach((el) => {
      el.addEventListener("click", () => toggleWork(el.dataset.toggleWork));
    });
    container.querySelectorAll("[data-play]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await window.ChoirMedia.playRecording(btn.dataset.play);
        } catch (err) {
          alert(err.message || "播放失败");
        }
      });
    });
    container.querySelectorAll("[data-del-rec]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("确定删除该录音？")) return;
        try {
          await ChoirAPI.del(`/recordings/${btn.dataset.delRec}`);
          await loadWorks();
        } catch (err) {
          alert(err.message || "删除失败");
        }
      });
    });
    container.querySelectorAll("[data-upload-work]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerUpload(btn.dataset.uploadWork);
      });
    });
  }

  function toggleWork(id) {
    const body = document.getElementById("body-" + id);
    const toggle = document.getElementById("toggle-" + id);
    if (!body) return;
    body.classList.toggle("expanded");
    if (toggle) toggle.classList.toggle("expanded");
  }

  function filterWorks() {
    const part = document.getElementById("filterPart")?.value;
    const status = document.getElementById("filterStatus")?.value;
    const search = (document.getElementById("searchWork")?.value || "").toLowerCase();

    const filtered = works.filter((w) => {
      if (search && !w.name.toLowerCase().includes(search)) return false;
      if (status && getStatus(w) !== status) return false;
      if (part) {
        const p = parseInt(part, 10);
        const has = (w.recordings || []).some((r) => (r.parts || []).includes(p));
        if (status === "empty") return getStatus(w) === "empty";
        if (!has) return false;
      }
      return true;
    });
    renderWorks(filtered);
  }

  async function loadWorks() {
    const data = await ChoirAPI.get("/works");
    works = data.works || [];
    filterWorks();
  }

  function triggerUpload(workId) {
    let input = document.getElementById("recordingFileInput");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "recordingFileInput";
      input.accept = "audio/*,video/*";
      input.hidden = true;
      document.body.appendChild(input);
    }
    input.onchange = async () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      const name =
        prompt("录音名称", file.name.replace(/\.[^.]+$/, "")) || file.name;
      const partsRaw = prompt("关联声部编号（1-8，逗号分隔，可留空）", "");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      if (partsRaw && partsRaw.trim()) {
        const parts = partsRaw
          .split(/[,，\s]+/)
          .map((x) => parseInt(x.trim(), 10))
          .filter((n) => n >= 1 && n <= 8);
        if (parts.length) fd.append("parts", JSON.stringify(parts));
      }
      try {
        await ChoirAPI.postForm(`/works/${workId}/recordings/upload`, fd);
        await loadWorks();
        const body = document.getElementById("body-" + workId);
        const toggle = document.getElementById("toggle-" + workId);
        if (body && !body.classList.contains("expanded")) {
          body.classList.add("expanded");
          if (toggle) toggle.classList.add("expanded");
        }
      } catch (err) {
        alert(err.message || "上传失败");
      }
    };
    input.click();
  }

  async function createWork() {
    const name = prompt("作品名称");
    if (!name || !name.trim()) return;
    const composer = prompt("作曲者（可选）", "") || "";
    try {
      await ChoirAPI.post("/works", { name: name.trim(), composer: composer.trim() });
      await loadWorks();
    } catch (err) {
      alert(err.message || "创建失败");
    }
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;
    window.ChoirPermissions.applyNavPermissions(currentUser);

    const btn = document.getElementById("btnNewWork");
    if (btn) {
      if (canWrite()) {
        btn.addEventListener("click", createWork);
      } else {
        btn.hidden = true;
      }
    }

    document.getElementById("filterPart")?.addEventListener("change", filterWorks);
    document.getElementById("filterStatus")?.addEventListener("change", filterWorks);
    document.getElementById("searchWork")?.addEventListener("input", filterWorks);

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
