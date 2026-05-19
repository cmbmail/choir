/**
 * 乐谱详情 — 作品歌谱、介绍、分部音频、演示音频、视频
 */
(function () {
  const VOICE = {
    1: "S1 女高音 1",
    2: "S2 女高音 2",
    3: "A1 女低音 1",
    4: "A2 女低音 2",
    5: "T1 男高音 1",
    6: "T2 男高音 2",
    7: "B1 男低音 1",
    8: "B2 男低音 2",
  };

  let currentUser = null;
  let work = null;
  let scoreDoc = null;
  let workDocs = [];
  let scorePreviewUrl = null;
  let choirWorks = [];

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
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getDocId() {
    const p = new URLSearchParams(window.location.search);
    return parseInt(p.get("id") || p.get("document_id") || "0", 10);
  }

  function getWorkId() {
    const p = new URLSearchParams(window.location.search);
    return parseInt(p.get("work_id") || "0", 10);
  }

  function canWriteDocs() {
    if (currentUser?.system_super_admin) return true;
    if (!work?.is_owner) return false;
    return (
      window.ChoirAuth.hasPermission(currentUser, "documents.write") ||
      window.ChoirAuth.hasPermission(currentUser, "documents.*")
    );
  }

  /** @deprecated use canWriteDocs */
  function canWrite() {
    return canWriteDocs();
  }

  function isDemoAudio(d) {
    return (
      d.doc_type === "accompaniment" &&
      (!d.voice_parts || !d.voice_parts.length)
    );
  }

  function isPartAudio(d) {
    return (
      d.doc_type === "accompaniment" &&
      d.voice_parts &&
      d.voice_parts.length > 0
    );
  }

  function isVideoDoc(d) {
    return d.doc_type === "performance_video";
  }

  function scoreDocs() {
    return workDocs.filter((d) => d.doc_type === "score");
  }

  function demoAudios() {
    return workDocs.filter(isDemoAudio);
  }

  function partAudios() {
    return workDocs.filter(isPartAudio);
  }

  function videoDocs() {
    return workDocs.filter(isVideoDoc);
  }

  function primaryVideo() {
    return videoDocs()[0] || null;
  }

  function setBreadcrumb() {
    const bc = document.querySelector(".breadcrumb");
    const name = work?.name || scoreDoc?.work_name || scoreDoc?.title || "乐谱";
    if (bc) {
      bc.innerHTML =
        '<a href="极简中式-资料管理.html">资料管理</a><span class="sep">/</span>' +
        '<span class="current">' +
        esc(name) +
        "</span>";
    }
    if ($("bcName")) $("bcName").textContent = name;
    document.title = name + " · 弦歌合唱团";
  }

  function setViewerTitle() {
    const el = $("viewerTitle");
    if (!el) return;
    if (scoreDoc) {
      const fn = scoreDoc.file_name || "";
      el.textContent =
        scoreDoc.title || fn || work?.name || scoreDoc.work_name || "乐谱";
    } else {
      el.textContent = work?.name ? work.name + "（尚未上传乐谱）" : "尚未上传乐谱";
    }
  }

  async function loadWorkDocs(workId) {
    const data = await ChoirAPI.get(
      "/documents?" + new URLSearchParams({ work_id: String(workId) })
    );
    workDocs = data.documents || [];
  }

  function pickPrimaryScore(preferredId) {
    if (preferredId) {
      const found = workDocs.find((d) => d.document_id === preferredId);
      if (found && found.doc_type === "score") return found;
    }
    const scores = scoreDocs();
    return scores[0] || null;
  }

  async function loadContext(preferredDocId, workId) {
    if (workId) {
      work = await ChoirAPI.get("/works/" + workId);
      await loadWorkDocs(workId);
      scoreDoc = pickPrimaryScore(preferredDocId);
      if (preferredDocId && !scoreDoc) {
        const d = workDocs.find((x) => x.document_id === preferredDocId);
        if (d) scoreDoc = d;
      }
      return;
    }
    if (preferredDocId) {
      const d = await ChoirAPI.get("/documents/" + preferredDocId);
      if (d.work_id) {
        work = await ChoirAPI.get("/works/" + d.work_id);
        await loadWorkDocs(d.work_id);
        scoreDoc = pickPrimaryScore(preferredDocId);
      } else {
        work = {
          work_id: null,
          name: d.title,
          composer: "",
          is_owner: true,
        };
        workDocs = [d];
        scoreDoc = d.doc_type === "score" ? d : null;
      }
    }
  }

  async function patchDoc(docId, body) {
    return ChoirAPI.patch("/documents/" + docId, body);
  }

  async function uploadAsset(file, docType, extra) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", file.name);
    fd.append("doc_type", docType);
    fd.append("work_id", String(work.work_id));
    if (extra?.voice_parts) {
      fd.append("voice_parts", JSON.stringify(extra.voice_parts));
    }
    if (extra?.video_url) fd.append("video_url", extra.video_url);
    return ChoirAPI.postForm("/documents/upload", fd);
  }

  async function refresh() {
    const wid = work?.work_id;
    if (!wid) return;
    await loadWorkDocs(wid);
    const sid = scoreDoc?.document_id;
    scoreDoc = pickPrimaryScore(sid);
    renderAll();
  }

  async function deleteDoc(docId) {
    if (!(await ChoirDialog.confirm("确定删除该文件？", "删除文件"))) return;
    await ChoirAPI.del("/documents/" + docId);
    if (scoreDoc?.document_id === docId) scoreDoc = null;
    await refresh();
  }

  function bindWriteActions() {
    const showDocs = canWriteDocs();
    document.querySelectorAll("[data-write-only]").forEach((el) => {
      el.hidden = !showDocs;
    });
  }

  function renderIntroHtml(raw) {
    const editor = window.ChoirRichEditor;
    if (!raw) return "";
    if (editor) {
      return editor.sanitizeHtml(editor.plainToHtml(raw));
    }
    return esc(raw).replace(/\n/g, "<br>");
  }

  function renderIntro() {
    const el = $("introText");
    if (!el) return;
    const text = scoreDoc?.description || "";
    if (text) {
      el.classList.add("intro-rich");
      el.innerHTML = renderIntroHtml(text);
      el.querySelectorAll("a[href]").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
    } else {
      el.classList.remove("intro-rich");
      el.innerHTML =
        '<p style="color:var(--text-muted)">暂无介绍，' +
        (canWrite() ? "点击「编辑」添加乐谱介绍。" : "") +
        "</p>";
    }
  }

  function renderMeta() {
    const d = scoreDoc;
    if ($("diCategory")) $("diCategory").textContent = d?.category || "—";
    if ($("diStyle")) $("diStyle").textContent = d?.style || "—";
    if ($("diCollection")) {
      $("diCollection").textContent = d?.collection || d?.collection_name || "—";
    }
    if ($("diKey")) $("diKey").textContent = d?.musical_key || "—";
    if ($("diUploader")) $("diUploader").textContent = d?.uploader || "—";
    if ($("diDate")) $("diDate").textContent = (d?.created_at || "").slice(0, 10);
    if ($("diSize")) $("diSize").textContent = formatSize(d?.file_size);
    if ($("diPages")) $("diPages").textContent = "—";

    const tags = $("diTags");
    if (tags && d) {
      const parts = [];
      if (d.category) parts.push('<span class="detail-tag tag-cat">' + esc(d.category) + "</span>");
      if (d.style) parts.push('<span class="detail-tag tag-style">' + esc(d.style) + "</span>");
      if (d.collection) parts.push('<span class="detail-tag tag-coll">' + esc(d.collection) + "</span>");
      tags.innerHTML = parts.join("");
    }

    const dlMain = $("btnDownloadScore");
    if (dlMain) dlMain.hidden = !d?.document_id;
  }

  function absApiUrl(path) {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return (window.location.origin || "") + path;
  }

  async function resolvePreviewUrl(doc) {
    if (!doc?.document_id) return null;
    try {
      const play = await ChoirAPI.get(
        "/documents/" + doc.document_id + "/play-url?embed=1"
      );
      if (play.kind === "external" && doc.video_url) return null;
      return absApiUrl(play.url);
    } catch (e) {
      console.warn("preview url", e);
      return null;
    }
  }

  async function renderScoreViewer() {
    const page = $("scorePage");
    const nav = $("scorePageNav");
    if (!page) return;

    if (!scoreDoc) {
      scorePreviewUrl = null;
      page.classList.remove("score-page--clickable");
      page.innerHTML =
        '<div class="score-page-placeholder">' +
        "<p>尚未上传乐谱 PDF</p>" +
        (canWrite()
          ? '<p class="hint">点击下方「上传乐谱」添加</p>'
          : '<p class="hint">请联系管理员上传</p>') +
        "</div>";
      if (nav) nav.hidden = true;
      return;
    }

    if (nav) nav.hidden = true;
    page.classList.add("score-page--clickable");
    scorePreviewUrl = await resolvePreviewUrl(scoreDoc);
    const mime = (scoreDoc.mime_type || "").toLowerCase();
    const isPdf =
      mime.includes("pdf") ||
      (scoreDoc.file_name || "").toLowerCase().endsWith(".pdf");

    if (scorePreviewUrl && isPdf) {
      page.innerHTML =
        '<iframe class="score-preview-frame" title="乐谱预览" src="' +
        esc(scorePreviewUrl) +
        '"></iframe>' +
        '<div class="score-expand-hint">点击放大查看</div>';
    } else if (scorePreviewUrl && mime.startsWith("image/")) {
      page.innerHTML =
        '<img class="score-preview-img" alt="乐谱" src="' +
        esc(scorePreviewUrl) +
        '"/>' +
        '<div class="score-expand-hint">点击放大查看</div>';
    } else if (scorePreviewUrl) {
      page.innerHTML =
        '<div class="score-page-placeholder"><button type="button" class="btn btn-gold" id="btnOpenScore">在线打开乐谱</button></div>';
      $("btnOpenScore")?.addEventListener("click", () =>
        window.ChoirMedia.playDocument(scoreDoc.document_id)
      );
    } else {
      page.innerHTML =
        '<div class="score-page-placeholder"><p>' +
        esc(scoreDoc.title || scoreDoc.file_name || "乐谱") +
        '</p><p class="hint">预览加载失败，请尝试下载</p></div>';
    }

    page.onclick = () => {
      if (scorePreviewUrl && (isPdf || mime.startsWith("image/"))) {
        openScoreExpand(scorePreviewUrl, isPdf);
      }
    };
  }

  function openScoreExpand(url, isPdf) {
    const modal = $("scoreExpandModal");
    const body = $("scoreExpandBody");
    if (!modal || !body) return;
    if (isPdf) {
      body.innerHTML =
        '<iframe title="乐谱全屏" style="width:100%;height:min(90vh,900px);border:0;background:#fff" src="' +
        esc(url) +
        '"></iframe>';
    } else {
      body.innerHTML =
        '<img alt="乐谱" style="max-width:100%;max-height:90vh;margin:0 auto" src="' +
        esc(url) +
        '"/>';
    }
    modal.hidden = false;
  }

  function closeScoreExpand() {
    const modal = $("scoreExpandModal");
    const body = $("scoreExpandBody");
    if (modal) modal.hidden = true;
    if (body) body.innerHTML = "";
  }

  function renderDemoList() {
    const list = $("demoAudioList");
    if (!list) return;
    const items = demoAudios();
    if (!items.length) {
      list.innerHTML =
        '<p class="section-empty">暂无演示音频</p>';
      return;
    }
    list.innerHTML = items
      .map((d) => {
        const title = d.title || d.file_name || "演示音频";
        let actions =
          '<button type="button" class="audio-play-btn" data-play="' +
          d.document_id +
          '" title="播放"><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg></button>';
        if (canWrite()) {
          actions +=
            '<button type="button" class="audio-dl-btn" data-del="' +
            d.document_id +
            '">删除</button>';
        }
        return (
          '<div class="demo-player">' +
          '<button type="button" class="demo-play-btn" data-play="' +
          d.document_id +
          '"><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg></button>' +
          '<div class="demo-track-info"><div class="demo-track-name">' +
          esc(title) +
          "</div><div class=\"demo-track-sub\">" +
          formatSize(d.file_size) +
          "</div></div>" +
          '<div style="display:flex;gap:0.35rem;align-items:center">' +
          actions +
          "</div></div>"
        );
      })
      .join("");
    bindPlayButtons(list);
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteDoc(parseInt(btn.dataset.del, 10));
      });
    });
  }

  function renderPartList() {
    const list = $("partAudioList");
    if (!list) return;
    const items = partAudios();
    if (!items.length) {
      list.innerHTML = '<p class="section-empty">暂无分声部音频</p>';
      return;
    }
    list.innerHTML = items
      .map((d) => {
        const part = (d.voice_parts || [])[0];
        const label = VOICE[part] || "声部 " + part;
        const title = d.title || d.file_name || label;
        let actions =
          '<button type="button" class="audio-play-btn" data-play="' +
          d.document_id +
          '"><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg></button>' +
          '<button type="button" class="audio-dl-btn" data-dl="' +
          d.document_id +
          '">下载</button>';
        if (canWrite()) {
          actions +=
            '<button type="button" class="audio-dl-btn" data-del="' +
            d.document_id +
            '">删除</button>';
        }
        return (
          '<div class="audio-item">' +
          '<div class="audio-icon"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/></svg></div>' +
          '<div class="audio-info"><div class="audio-name">' +
          esc(title) +
          '</div><div class="audio-dur">' +
          esc(label) +
          " · " +
          formatSize(d.file_size) +
          "</div></div>" +
          actions +
          "</div>"
        );
      })
      .join("");
    bindPlayButtons(list);
    list.querySelectorAll("[data-dl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const doc = workDocs.find((x) => x.document_id === parseInt(btn.dataset.dl, 10));
        window.ChoirMedia.downloadDocument(
          parseInt(btn.dataset.dl, 10),
          doc?.file_name || doc?.title
        ).catch((e) => ChoirDialog.alert(e.message || "下载失败"));
      });
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteDoc(parseInt(btn.dataset.del, 10)));
    });
  }

  function bindPlayButtons(root) {
    root.querySelectorAll("[data-play]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.ChoirMedia.playDocument(parseInt(btn.dataset.play, 10)).catch((err) =>
          ChoirDialog.alert(err.message || "无法播放")
        );
      });
    });
  }

  function renderVideo() {
    const embed = $("videoEmbed");
    const descEl = $("videoDesc");
    const v = primaryVideo();
    if (descEl) {
      descEl.textContent = v?.description || v?.title || "暂无视频摘要";
    }
    if (!embed) return;
    if (!v) {
      embed.innerHTML =
        '<div class="placeholder"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><p>暂无视频</p></div>';
      embed.onclick = null;
      return;
    }
    if (v.video_url) {
      embed.innerHTML =
        '<div class="placeholder" style="cursor:pointer"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><p>点击播放</p></div>';
      embed.onclick = () => playVideoDoc(v);
    } else if (v.cde_file_id) {
      embed.innerHTML =
        '<div class="placeholder" style="cursor:pointer"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><p>点击播放</p></div>';
      embed.onclick = () => playVideoDoc(v);
    } else {
      embed.innerHTML = '<div class="placeholder"><p>无可播放文件</p></div>';
    }
  }

  async function playVideoDoc(v) {
    if (v.video_url) {
      window.openVideoModal(v.video_url, v.title);
      return;
    }
    await window.ChoirMedia.playDocument(v.document_id);
  }

  function renderRelated() {
    const list = $("relatedList");
    if (!list) return;
    let html = '<a class="related-item" href="极简中式-资料管理.html">← 返回资料列表</a>';
    const others = scoreDocs().filter(
      (d) => d.document_id !== scoreDoc?.document_id
    );
    others.forEach((d) => {
      html +=
        '<a class="related-item" href="极简中式-乐谱详情.html?id=' +
        d.document_id +
        '"><div class="related-info"><div class="related-name">' +
        esc(d.title || d.file_name) +
        '</div><div class="related-meta">相关乐谱</div></div></a>';
    });
    list.innerHTML = html;
  }

  function renderAll() {
    setBreadcrumb();
    setViewerTitle();
    bindWriteActions();
    renderIntro();
    renderMeta();
    renderScoreViewer();
    renderDemoList();
    renderPartList();
    renderVideo();
    renderRelated();
  }

  function isEmptyRichHtml(html) {
    const plain = String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .trim();
    return !plain;
  }

  async function editIntro() {
    if (!scoreDoc?.document_id) {
      await ChoirDialog.alert("请先上传乐谱后再编辑介绍");
      return;
    }
    if (!window.ChoirRichEditor) {
      await ChoirDialog.alert("富文本编辑器加载失败，请刷新页面重试");
      return;
    }
    let html;
    try {
      html = await window.ChoirRichEditor.openEditorModal({
        title: "编辑乐谱介绍",
        html: scoreDoc.description || "",
      });
    } catch (e) {
      await ChoirDialog.alert(e.message || "无法打开编辑器");
      return;
    }
    if (html === null) return;
    const saved = isEmptyRichHtml(html) ? null : html;
    scoreDoc = await patchDoc(scoreDoc.document_id, { description: saved });
    renderIntro();
  }

  async function loadChoirWorks() {
    let path = "/works?include_recordings=0";
    const choirId = work?.choir_id || currentUser?.choir_id;
    if (currentUser?.system_super_admin && choirId) {
      path += "&choir_id=" + choirId;
    }
    const data = await ChoirAPI.get(path);
    choirWorks = data.works || [];
  }

  function closeMetaModal() {
    const modal = $("metaEditModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  async function openMetaModal() {
    if (!scoreDoc?.document_id) {
      await ChoirDialog.alert("请先上传乐谱");
      return;
    }
    await loadChoirWorks();
    const sel = $("metaEditWork");
    if (!sel) return;
    if (!choirWorks.length) {
      await ChoirDialog.alert("暂无可用作品，请先在资料管理中创建作品");
      return;
    }
    const currentWorkId = work?.work_id || scoreDoc.work_id;
    sel.innerHTML = choirWorks
      .map((w) => {
        const label =
          esc(w.name) + (w.composer ? " · " + esc(w.composer) : "");
        const selected = w.work_id === currentWorkId ? " selected" : "";
        return (
          '<option value="' +
          w.work_id +
          '"' +
          selected +
          ">" +
          label +
          "</option>"
        );
      })
      .join("");

    const d = scoreDoc;
    if ($("metaEditCategory")) $("metaEditCategory").value = d.category || "";
    if ($("metaEditStyle")) $("metaEditStyle").value = d.style || "";
    if ($("metaEditCollection")) {
      $("metaEditCollection").value = d.collection || d.collection_name || "";
    }
    if ($("metaEditKey")) $("metaEditKey").value = d.musical_key || "";
    if ($("metaEditUploader")) {
      $("metaEditUploader").textContent = d.uploader || "—";
    }

    const modal = $("metaEditModal");
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  async function saveMetaModal() {
    if (!scoreDoc?.document_id) return;
    const sel = $("metaEditWork");
    const workId = sel ? parseInt(sel.value, 10) : NaN;
    if (!Number.isFinite(workId)) {
      await ChoirDialog.alert("请选择所属作品");
      return;
    }

    const body = {
      work_id: workId,
      category: ($("metaEditCategory")?.value || "").trim(),
      style: ($("metaEditStyle")?.value || "").trim(),
      collection_name: ($("metaEditCollection")?.value || "").trim(),
      musical_key: ($("metaEditKey")?.value || "").trim(),
    };

    const prevWorkId = work?.work_id;
    scoreDoc = await patchDoc(scoreDoc.document_id, body);

    if (workId !== prevWorkId) {
      work = await ChoirAPI.get("/works/" + workId);
      const qs = new URLSearchParams(window.location.search);
      qs.set("id", String(scoreDoc.document_id));
      qs.delete("work_id");
      history.replaceState(null, "", "?" + qs.toString());
      await refresh();
    } else {
      renderMeta();
      setBreadcrumb();
      setViewerTitle();
    }
    closeMetaModal();
  }

  async function editVideoSummary() {
    const v = primaryVideo();
    if (!v) {
      await ChoirDialog.alert("请先上传视频");
      return;
    }
    const val = await ChoirDialog.prompt({
      title: "编辑视频摘要",
      label: "摘要",
      value: v.description || "",
      multiline: true,
      maxlength: 2000,
    });
    if (val === null) return;
    await patchDoc(v.document_id, { description: val });
    await refresh();
  }

  function pickFile(accept, multiple, onPick) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = !!multiple;
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (files.length) onPick(files);
    });
    input.click();
  }

  async function uploadScore(files) {
    for (const file of files) {
      const uploaded = await uploadAsset(file, "score");
      scoreDoc = uploaded;
    }
    await refresh();
    if (scoreDoc?.document_id) {
      const qs = new URLSearchParams(window.location.search);
      qs.set("id", String(scoreDoc.document_id));
      qs.delete("work_id");
      history.replaceState(null, "", "?" + qs.toString());
    }
  }

  async function uploadDemo(files) {
    for (const file of files) await uploadAsset(file, "accompaniment");
    await refresh();
  }

  async function uploadPart(files) {
    const picked = await ChoirDialog.form({
      title: "上传分部伴奏",
      hint: "选择该伴奏对应的声部",
      wide: false,
      fields: [
        {
          key: "part",
          label: "声部",
          type: "select",
          required: true,
          value: "1",
          options: ChoirDialog.voiceOptions,
        },
      ],
    });
    if (!picked) return;
    const part = parseInt(picked.part, 10);
    if (!VOICE[part]) {
      await ChoirDialog.alert("无效声部");
      return;
    }
    for (const file of files) {
      await uploadAsset(file, "accompaniment", { voice_parts: [part] });
    }
    await refresh();
  }

  async function uploadVideo(files) {
    if (files.length && files[0].size > 0) {
      await uploadAsset(files[0], "performance_video");
    } else {
      const data = await ChoirDialog.form({
        title: "添加视频链接",
        fields: [
          {
            key: "url",
            label: "视频链接",
            placeholder: "https://...",
          },
          {
            key: "title",
            label: "视频标题",
            value: "献唱视频",
            maxlength: 100,
          },
        ],
      });
      if (!data) return;
      const url = (data.url || "").trim();
      if (url) {
        const title = (data.title || "献唱视频").trim() || "献唱视频";
        const fd = new FormData();
        fd.append("file", new Blob(["link"], { type: "text/plain" }), "link.txt");
        fd.append("title", title);
        fd.append("doc_type", "performance_video");
        fd.append("work_id", String(work.work_id));
        fd.append("video_url", url);
        await ChoirAPI.postForm("/documents/upload", fd);
      }
    }
    await refresh();
  }

  function bindUi() {
    $("btnEditIntro")?.addEventListener("click", () => editIntro().catch((e) => ChoirDialog.alert(e.message || "失败")));
    $("btnEditMeta")?.addEventListener("click", () =>
      openMetaModal().catch((e) => ChoirDialog.alert(e.message || "打开失败"))
    );
    $("metaEditCancel")?.addEventListener("click", closeMetaModal);
    $("metaEditSave")?.addEventListener("click", () =>
      saveMetaModal().catch((e) => ChoirDialog.alert(e.message || "保存失败"))
    );
    $("metaEditModal")?.addEventListener("click", (e) => {
      if (e.target.id === "metaEditModal") closeMetaModal();
    });
    $("btnEditVideoDesc")?.addEventListener("click", () =>
      editVideoSummary().catch((e) => ChoirDialog.alert(e.message || "失败"))
    );
    $("btnUploadScore")?.addEventListener("click", () => {
      pickFile(".pdf,application/pdf,image/*", false, (files) =>
        uploadScore(files).catch((e) => ChoirDialog.alert(e.message || "上传失败"))
      );
    });
    $("btnUploadDemo")?.addEventListener("click", () => {
      pickFile("audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg", true, (files) =>
        uploadDemo(files).catch((e) => ChoirDialog.alert(e.message || "上传失败"))
      );
    });
    $("btnUploadPart")?.addEventListener("click", () => {
      pickFile("audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg", true, (files) =>
        uploadPart(files).catch((e) => ChoirDialog.alert(e.message || "上传失败"))
      );
    });
    $("btnUploadVideo")?.addEventListener("click", () => {
      pickFile("video/*,.mp4,.mov,.webm", false, (files) => {
        if (files.length) {
          uploadVideo(files).catch((e) => ChoirDialog.alert(e.message || "上传失败"));
        } else {
          uploadVideo([]).catch((e) => ChoirDialog.alert(e.message || "上传失败"));
        }
      });
    });
    $("btnDeleteVideo")?.addEventListener("click", () => {
      const v = primaryVideo();
      if (v) deleteDoc(v.document_id);
    });
    $("btnDownloadScore")?.addEventListener("click", () => {
      if (!scoreDoc) return;
      window.ChoirMedia.downloadDocument(
        scoreDoc.document_id,
        scoreDoc.file_name || scoreDoc.title
      ).catch((e) => ChoirDialog.alert(e.message || "下载失败"));
    });
    $("btnScoreExpandClose")?.addEventListener("click", closeScoreExpand);
    $("scoreExpandModal")?.addEventListener("click", (e) => {
      if (e.target.id === "scoreExpandModal") closeScoreExpand();
    });
    $("btnAddVideoLink")?.addEventListener("click", () => {
      uploadVideo([]).catch((e) => ChoirDialog.alert(e.message || "失败"));
    });
  }

  async function init() {
    currentUser = await ChoirAuth.requireLogin();
    if (!currentUser) return;

    const docId = getDocId();
    const workId = getWorkId();

    if (workId) {
      await loadContext(docId, workId);
    } else if (docId) {
      await loadContext(docId, 0);
    } else {
      await ChoirDialog.alert("缺少作品或乐谱参数");
      window.location.href = "极简中式-资料管理.html";
      return;
    }

    if (!work) {
      await ChoirDialog.alert("作品不存在");
      window.location.href = "极简中式-资料管理.html";
      return;
    }

    bindUi();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirUI.initUserDropdown();
    ChoirAppShell.init();
    init().catch(async (e) => {
      if (e.message === "未登录") return;
      const msg =
        e.status === 403
          ? "无权限查看该作品或乐谱，请确认已登录且有资料阅读权限。"
          : e.message || "加载失败";
      await ChoirDialog.alert(msg);
      if (e.status === 403 || e.status === 410) {
        window.location.href = "极简中式-资料管理.html";
      }
    });
  });
})();
