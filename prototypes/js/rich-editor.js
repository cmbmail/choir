/**
 * 富文本在线编辑（Quill）— 乐谱介绍等场景复用
 */
(function () {
  const QUILL_CSS =
    "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css";
  const QUILL_JS =
    "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js";
  const PURIFY_JS =
    "https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js";

  const PURIFY_OPTS = {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "span",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  };

  let loadPromise = null;
  let modalEl = null;
  let quillInstance = null;
  let resolveModal = null;

  function loadCss(href) {
    if (document.querySelector(`link[data-choir-rich="${href}"]`)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.choirRich = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error("样式加载失败"));
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    if (document.querySelector(`script[data-choir-rich="${src}"]`)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.dataset.choirRich = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("脚本加载失败"));
      document.head.appendChild(s);
    });
  }

  function ensureLibs() {
    if (loadPromise) return loadPromise;
    loadPromise = loadCss(QUILL_CSS)
      .then(() => loadScript(PURIFY_JS))
      .then(() => loadScript(QUILL_JS))
      .then(() => {
        if (!window.Quill) throw new Error("富文本编辑器加载失败");
      });
    return loadPromise;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function looksLikeHtml(s) {
    return /<[a-z][\s\S]*>/i.test(String(s || ""));
  }

  function sanitizeHtml(html) {
    const raw = String(html || "").trim();
    if (!raw) return "";
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw, PURIFY_OPTS);
    }
    return esc(raw).replace(/\n/g, "<br>");
  }

  function plainToHtml(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    if (looksLikeHtml(t)) return t;
    const paras = t.split(/\n{2,}/);
    return paras
      .map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>")
      .join("");
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement("div");
    modalEl.id = "choirRichEditorModal";
    modalEl.className = "modal-overlay choir-rich-modal";
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.innerHTML =
      '<div class="modal-box choir-rich-modal__box">' +
      '<h2 id="choirRichEditorTitle">在线编辑</h2>' +
      '<div id="choirRichEditorMount" class="choir-rich-editor-mount"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-mini" id="choirRichEditorCancel">取消</button>' +
      '<button type="button" class="btn-mini choir-rich-save" id="choirRichEditorSave">保存</button>' +
      "</div></div>";
    document.body.appendChild(modalEl);

    modalEl.querySelector("#choirRichEditorCancel")?.addEventListener("click", () => {
      closeModal(null);
    });
    modalEl.querySelector("#choirRichEditorSave")?.addEventListener("click", () => {
      if (!quillInstance) return;
      const html = sanitizeHtml(quillInstance.root.innerHTML);
      closeModal(html);
    });
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal(null);
    });
    return modalEl;
  }

  function closeModal(result) {
    if (modalEl) {
      modalEl.classList.remove("open");
      modalEl.setAttribute("aria-hidden", "true");
    }
    quillInstance = null;
    const mount = document.getElementById("choirRichEditorMount");
    if (mount) mount.innerHTML = "";
    if (resolveModal) {
      const fn = resolveModal;
      resolveModal = null;
      fn(result);
    }
  }

  function initQuill(mount, html) {
    mount.innerHTML = '<div id="choirRichEditorEditor"></div>';
    quillInstance = new window.Quill("#choirRichEditorEditor", {
      theme: "snow",
      placeholder: "输入乐谱介绍…",
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote", "link"],
          ["clean"],
        ],
      },
    });
    const initial = plainToHtml(html);
    if (initial) {
      quillInstance.clipboard.dangerouslyPasteHTML(sanitizeHtml(initial));
    }
  }

  function openEditorModal(opts) {
    const title = opts?.title || "在线编辑";
    const html = opts?.html ?? opts?.content ?? "";

    return ensureLibs().then(
      () =>
        new Promise((resolve) => {
          resolveModal = resolve;
          const modal = ensureModal();
          const titleEl = document.getElementById("choirRichEditorTitle");
          if (titleEl) titleEl.textContent = title;
          const mount = document.getElementById("choirRichEditorMount");
          if (!mount) {
            resolve(null);
            return;
          }
          initQuill(mount, html);
          modal.classList.add("open");
          modal.setAttribute("aria-hidden", "false");
          setTimeout(() => quillInstance?.focus(), 80);
        })
    );
  }

  window.ChoirRichEditor = {
    ensureLibs,
    sanitizeHtml,
    plainToHtml,
    looksLikeHtml,
    openEditorModal,
  };
})();
