/**
 * 在线播放（不提供下载）— 音频/视频弹层
 */
(function () {
  function ensureModal() {
    if (document.getElementById("choirMediaPlayer")) return;
    const wrap = document.createElement("div");
    wrap.id = "choirMediaPlayer";
    wrap.style.cssText =
      "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:2000;align-items:center;justify-content:center;flex-direction:column;gap:1rem;padding:1rem;";
    wrap.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:720px;color:#fff;">' +
      '<span id="choirMediaTitle" style="font-size:0.9rem"></span>' +
      '<button type="button" id="choirMediaClose" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer">&times;</button>' +
      "</div>" +
      '<audio id="choirMediaAudio" controls style="width:100%;max-width:720px;display:none"></audio>' +
      '<iframe id="choirMediaVideo" style="display:none;width:100%;max-width:800px;height:450px;border:0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
    document.body.appendChild(wrap);
    document.getElementById("choirMediaClose").addEventListener("click", close);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) close();
    });
  }

  function absUrl(path) {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return (window.location.origin || "") + path;
  }

  function openVideoModal(url, name) {
    ensureModal();
    const wrap = document.getElementById("choirMediaPlayer");
    const audio = document.getElementById("choirMediaAudio");
    const iframe = document.getElementById("choirMediaVideo");
    document.getElementById("choirMediaTitle").textContent = name || "视频播放";
    audio.pause();
    audio.removeAttribute("src");
    audio.style.display = "none";
    const embedUrl = url.includes("youtu.be/")
      ? "https://www.youtube.com/embed/" + url.split("youtu.be/")[1].split("?")[0] + "?autoplay=1"
      : url.includes("youtube.com/watch")
        ? "https://www.youtube.com/embed/" + new URL(url).searchParams.get("v") + "?autoplay=1"
        : url;
    iframe.src = embedUrl;
    iframe.style.display = "block";
    wrap.style.display = "flex";
  }

  function playAudioUrl(url, title) {
    ensureModal();
    const wrap = document.getElementById("choirMediaPlayer");
    const audio = document.getElementById("choirMediaAudio");
    const iframe = document.getElementById("choirMediaVideo");
    document.getElementById("choirMediaTitle").textContent = title || "正在播放";
    iframe.src = "";
    iframe.style.display = "none";
    audio.style.display = "block";
    audio.src = absUrl(url);
    wrap.style.display = "flex";
    audio.play().catch(() => {});
  }

  function close() {
    const wrap = document.getElementById("choirMediaPlayer");
    const audio = document.getElementById("choirMediaAudio");
    const iframe = document.getElementById("choirMediaVideo");
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    if (iframe) iframe.src = "";
    if (wrap) wrap.style.display = "none";
  }

  async function playDocument(documentId) {
    const data = await ChoirAPI.get(`/documents/${documentId}/play-url`);
    if (data.kind === "external") {
      openVideoModal(data.url, "");
      return;
    }
    const mime = (data.mime_type || "").toLowerCase();
    if (mime.startsWith("video/")) {
      openVideoModal(absUrl(data.url), "");
    } else {
      playAudioUrl(data.url, "");
    }
  }

  async function playRecording(recordingId) {
    const data = await ChoirAPI.get(`/recordings/${recordingId}/play-url`);
    playAudioUrl(data.url, "");
  }

  window.openVideoModal = openVideoModal;
  window.closeVideoModal = close;
  window.ChoirMedia = {
    playAudioUrl,
    openVideoModal,
    playDocument,
    playRecording,
    close,
  };
})();
