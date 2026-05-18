/**
 * 乐谱详情 — GET /api/documents/:id
 */
(function () {
  const VOICE = {
    1: "女高音 (Soprano)",
    2: "女低音 (Alto)",
    3: "男高音 (Tenor)",
    4: "男低音 (Bass)",
    5: "声部五",
    6: "声部六",
    7: "声部七",
    8: "声部八",
  };

  let doc = null;

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

  function formatSize(n) {
    if (!n) return "—";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getDocId() {
    const p = new URLSearchParams(window.location.search);
    return parseInt(p.get("id") || p.get("document_id") || "0", 10);
  }

  async function loadDocument(id) {
    doc = await ChoirAPI.get(`/documents/${id}`);
    document.title = (doc.title || "乐谱") + " · 弦歌合唱团";

    const bc = document.querySelector(".breadcrumb");
    if (bc) {
      const workCrumb = doc.work_id
        ? `<a href="极简中式-作品详情.html?work_id=${doc.work_id}">${esc(doc.work_name || "作品")}</a><span class="sep">/</span>`
        : "";
      bc.innerHTML =
        '<a href="极简中式-资料管理.html">资料管理</a><span class="sep">/</span>' +
        workCrumb +
        '<span class="current">' +
        esc(doc.title || doc.file_name || "乐谱") +
        "</span>";
    }
    if ($("bcName")) $("bcName").textContent = doc.title || "";
    if ($("viewerTitle")) {
      $("viewerTitle").textContent = (doc.file_name || doc.title || "乐谱") + "";
    }

    if ($("diWork")) {
      const workLabel = doc.work_name
        ? doc.work_name + (doc.work_composer ? " · " + doc.work_composer : "")
        : "—";
      $("diWork").textContent = workLabel;
    }
    if ($("diCategory")) $("diCategory").textContent = doc.category || "—";
    if ($("diStyle")) $("diStyle").textContent = doc.style || "—";
    if ($("diCollection")) $("diCollection").textContent = doc.collection || doc.collection_name || "—";
    if ($("diKey")) $("diKey").textContent = "—";
    if ($("diUploader")) $("diUploader").textContent = doc.uploader || "—";
    if ($("diDate")) $("diDate").textContent = (doc.created_at || "").slice(0, 10);
    if ($("diSize")) $("diSize").textContent = formatSize(doc.file_size);
    if ($("diPages")) $("diPages").textContent = "—";

    if ($("diTags")) {
      const tags = [];
      if (doc.category) tags.push('<span class="detail-tag tag-cat">' + doc.category + "</span>");
      if (doc.style) tags.push('<span class="detail-tag tag-style">' + doc.style + "</span>");
      if (doc.collection) tags.push('<span class="detail-tag tag-coll">' + doc.collection + "</span>");
      $("diTags").innerHTML = tags.join("");
    }

    if ($("introText")) {
      $("introText").innerHTML =
        "<p>" +
        (doc.title || "") +
        "</p><p style='margin-top:0.75rem;color:var(--text-muted);font-size:0.8rem'>在线预览，不提供下载。</p>";
    }

    const dlBtn = document.querySelector(".score-viewer-actions .btn");
    if (dlBtn) dlBtn.hidden = true;

    await renderViewer();
    renderPartList();
    renderVideoSection();
  }

  async function renderViewer() {
    const page = $("scorePage");
    if (!page) return;
    if (!doc.cde_file_id && !doc.video_url) {
      return;
    }
    try {
      const play = await ChoirAPI.get(`/documents/${doc.document_id}/play-url`);
      if (play.kind === "external" && doc.video_url) {
        page.innerHTML =
          '<div style="padding:1rem"><button type="button" class="btn btn-gold" id="btnWatchVideo">观看关联视频</button></div>';
        $("btnWatchVideo")?.addEventListener("click", () => {
          window.openVideoModal(doc.video_url, doc.title);
        });
        return;
      }
      const url = play.url;
      const mime = (play.mime_type || doc.mime_type || "").toLowerCase();
      if (mime.includes("pdf") || (doc.file_name || "").toLowerCase().endsWith(".pdf")) {
        page.innerHTML =
          '<iframe title="乐谱预览" style="width:100%;height:min(70vh,720px);border:0;background:#fff" src="' +
          url +
          '"></iframe>';
      } else if (mime.startsWith("audio/")) {
        page.innerHTML =
          '<div style="padding:2rem;text-align:center"><audio controls style="width:100%;max-width:480px" src="' +
          url +
          '"></audio></div>';
      } else {
        page.innerHTML =
          '<div style="padding:1rem"><button type="button" class="btn btn-gold" id="btnOpenStream">在线打开</button></div>';
        $("btnOpenStream")?.addEventListener("click", () => {
          window.ChoirMedia.playAudioUrl(url, doc.title);
        });
      }
    } catch (e) {
      console.warn(e);
    }
  }

  function renderPartList() {
    const list = $("partAudioList");
    if (!list) return;
    const parts = doc.voice_parts || [];
    if (!parts.length) {
      list.innerHTML = '<p style="font-size:0.75rem;color:var(--text-muted);padding:0.5rem">暂无分部信息</p>';
      return;
    }
    list.innerHTML = parts
      .map(
        (p) =>
          '<div class="audio-item"><div class="audio-info"><div class="audio-name">' +
          (VOICE[p] || "声部 " + p) +
          '</div></div><button type="button" class="audio-play-btn" data-play-doc="' +
          doc.document_id +
          '"><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg></button></div>'
      )
      .join("");
    list.querySelectorAll("[data-play-doc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.ChoirMedia.playDocument(doc.document_id);
      });
    });
  }

  function renderVideoSection() {
    if ($("demoTrackName")) $("demoTrackName").textContent = doc.title || "示范音频";
    if ($("demoTrackSub")) $("demoTrackSub").textContent = doc.uploader || "";
    const demoBtn = $("demoPlayBtn");
    if (demoBtn) {
      demoBtn.onclick = async () => {
        if (doc.video_url) {
          window.openVideoModal(doc.video_url, doc.title);
        } else if (doc.cde_file_id) {
          await window.ChoirMedia.playDocument(doc.document_id);
        } else {
          alert("暂无示范音视频");
        }
      };
    }
    if ($("relatedList")) {
      let related =
        '<a class="related-item" href="极简中式-资料管理.html">← 返回资料列表</a>';
      if (doc.work_id) {
        related +=
          '<a class="related-item" href="极简中式-作品详情.html?work_id=' +
          doc.work_id +
          '">作品资料（伴奏等）</a>';
      }
      $("relatedList").innerHTML = related;
    }
  }

  async function init() {
    const user = await ChoirAuth.requireLogin();
    if (!user) return;
    const id = getDocId();
    if (!id) {
      alert("缺少资料 ID");
      window.location.href = "极简中式-资料管理.html";
      return;
    }
    await loadDocument(id);
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init();
    init().catch((e) => {
      if (e.message !== "未登录") alert(e.message || "加载失败");
    });
  });
})();
