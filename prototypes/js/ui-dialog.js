/**
 * 全站统一弹窗：提示 / 确认 / 输入 / 表单 / Toast（极简中式）
 */
(function () {
  const VOICE_OPTS = [
    { value: "1", label: "S1 女高音 1" },
    { value: "2", label: "S2 女高音 2" },
    { value: "3", label: "A1 女低音 1" },
    { value: "4", label: "A2 女低音 2" },
    { value: "5", label: "T1 男高音 1" },
    { value: "6", label: "T2 男高音 2" },
    { value: "7", label: "B1 男低音 1" },
    { value: "8", label: "B2 男低音 2" },
  ];

  let toastTimer = null;
  let alertResolve = null;
  let confirmResolve = null;
  let promptResolve = null;
  let formResolve = null;
  let formFields = [];

  function injectStyles() {
    if (document.getElementById("choir-dialog-styles")) return;
    const el = document.createElement("style");
    el.id = "choir-dialog-styles";
    el.textContent = `
.choir-dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center;z-index:2000;padding:1rem}
.choir-dialog-overlay.open{display:flex}
.choir-dialog-overlay--dark{background:rgba(0,0,0,0.88)}
.choir-dialog-box{background:#F8F6F0;border:1px solid rgba(28,28,28,0.1);border-radius:4px;padding:1.5rem;width:min(480px,100%);max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(28,28,28,0.12)}
.choir-dialog-box--wide{width:min(720px,100%)}
.choir-dialog-box--dark{background:#1C1C1C;border-color:rgba(184,134,11,0.25);color:#fff}
.choir-dialog-title{font-size:1.1rem;font-weight:400;margin-bottom:0.5rem;color:#1C1C1C}
.choir-dialog-box--dark .choir-dialog-title{color:#F8F6F0}
.choir-dialog-text{font-size:0.85rem;line-height:1.6;color:#5a5548;margin-bottom:1.25rem;white-space:pre-wrap}
.choir-dialog-hint{font-size:0.75rem;color:#9c9490;margin-bottom:1rem;line-height:1.5}
.choir-dialog-form{display:flex;flex-direction:column;gap:0.75rem;margin-bottom:0.25rem}
.choir-dialog-form label{display:block;font-size:0.75rem;color:#5a5548;margin-bottom:0.25rem}
.choir-dialog-form input,.choir-dialog-form select,.choir-dialog-form textarea{width:100%;padding:0.5rem;border:1px solid rgba(28,28,28,0.1);border-radius:3px;background:#fff;font:inherit}
.choir-dialog-form textarea{min-height:88px;resize:vertical}
.choir-dialog-form input:focus,.choir-dialog-form select:focus,.choir-dialog-form textarea:focus{border-color:#B8860B;outline:none}
.choir-dialog-error{font-size:0.75rem;color:#b03030;margin-bottom:0.5rem}
.choir-dialog-actions{display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap;margin-top:1rem}
.choir-dialog-btn{padding:0.45rem 1rem;font-size:0.8rem;border-radius:3px;cursor:pointer;font:inherit;border:1px solid rgba(28,28,28,0.1);background:#fff;color:#5a5548}
.choir-dialog-btn:hover{border-color:#B8860B;color:#B8860B}
.choir-dialog-btn--gold{background:#B8860B;border-color:#B8860B;color:#fff}
.choir-dialog-btn--gold:hover{background:#D4A84B;border-color:#D4A84B;color:#fff}
.choir-dialog-video-wrap{width:min(800px,100%)}
.choir-dialog-video-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem}
.choir-dialog-video-head span{font-size:0.9rem;color:#F8F6F0}
.choir-dialog-video-close{background:none;border:none;color:rgba(255,255,255,0.75);font-size:1.5rem;cursor:pointer;line-height:1;padding:0.25rem}
.choir-dialog-video-frame{width:100%;aspect-ratio:16/9;border:0;background:#000;border-radius:4px}
#choirDialogToast{position:fixed;left:50%;bottom:calc(1.25rem + env(safe-area-inset-bottom,0px));transform:translateX(-50%) translateY(120%);z-index:2100;max-width:min(92vw,420px);padding:0.65rem 1rem;font-size:0.85rem;background:#1C1C1C;color:#F8F6F0;border:1px solid rgba(184,134,11,0.35);border-radius:4px;box-shadow:0 6px 24px rgba(0,0,0,0.2);opacity:0;transition:transform 0.25s ease,opacity 0.25s ease;pointer-events:none}
#choirDialogToast.show{transform:translateX(-50%) translateY(0);opacity:1}
#choirDialogToast.err{border-color:rgba(176,48,48,0.5);background:#3a1515}
`;
    document.head.appendChild(el);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function wireStaticHandlers() {
    document.getElementById("choirDialogAlertOk")?.addEventListener("click", () => {
      closeOverlay("choirDialogAlert");
      if (alertResolve) {
        const fn = alertResolve;
        alertResolve = null;
        fn();
      }
    });
    document.getElementById("choirDialogAlert")?.addEventListener("click", (e) => {
      if (e.target.id === "choirDialogAlert") {
        document.getElementById("choirDialogAlertOk")?.click();
      }
    });

    document.getElementById("choirDialogConfirmCancel")?.addEventListener("click", () => {
      closeOverlay("choirDialogConfirm");
      if (confirmResolve) {
        const fn = confirmResolve;
        confirmResolve = null;
        fn(false);
      }
    });
    document.getElementById("choirDialogConfirmOk")?.addEventListener("click", () => {
      closeOverlay("choirDialogConfirm");
      if (confirmResolve) {
        const fn = confirmResolve;
        confirmResolve = null;
        fn(true);
      }
    });
    document.getElementById("choirDialogConfirm")?.addEventListener("click", (e) => {
      if (e.target.id === "choirDialogConfirm") {
        document.getElementById("choirDialogConfirmCancel")?.click();
      }
    });

    document.getElementById("choirDialogPromptCancel")?.addEventListener("click", () => {
      closeOverlay("choirDialogPrompt");
      if (promptResolve) {
        const fn = promptResolve;
        promptResolve = null;
        fn(null);
      }
    });
    document.getElementById("choirDialogPromptForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("choirDialogPromptInput");
      const err = document.getElementById("choirDialogPromptError");
      const val = (input?.value || "").trim();
      if (input?.required && !val) {
        if (err) {
          err.textContent = "请填写内容";
          err.hidden = false;
        }
        input?.focus();
        return;
      }
      closeOverlay("choirDialogPrompt");
      if (promptResolve) {
        const fn = promptResolve;
        promptResolve = null;
        fn(val);
      }
    });
    document.getElementById("choirDialogPrompt")?.addEventListener("click", (e) => {
      if (e.target.id === "choirDialogPrompt") {
        document.getElementById("choirDialogPromptCancel")?.click();
      }
    });

    document.getElementById("choirDialogFormCancel")?.addEventListener("click", () => {
      closeOverlay("choirDialogForm");
      if (formResolve) {
        const fn = formResolve;
        formResolve = null;
        fn(null);
      }
    });
    document.getElementById("choirDialogFormEl")?.addEventListener("submit", (e) => {
      e.preventDefault();
      submitFormModal();
    });
    document.getElementById("choirDialogForm")?.addEventListener("click", (e) => {
      if (e.target.id === "choirDialogForm") {
        document.getElementById("choirDialogFormCancel")?.click();
      }
    });

    document.getElementById("choirDialogVideoClose")?.addEventListener("click", closeVideo);
    document.getElementById("choirDialogVideo")?.addEventListener("click", (e) => {
      if (e.target.id === "choirDialogVideo") closeVideo();
    });
  }

  function ensureRoot() {
    injectStyles();
    if (document.getElementById("choir-dialog-root")) return;

    const root = document.createElement("div");
    root.id = "choir-dialog-root";

    const alert = document.createElement("div");
    alert.id = "choirDialogAlert";
    alert.className = "choir-dialog-overlay";
    alert.setAttribute("aria-hidden", "true");
    alert.innerHTML =
      '<div class="choir-dialog-box"><h2 class="choir-dialog-title" id="choirDialogAlertTitle">提示</h2>' +
      '<p class="choir-dialog-text" id="choirDialogAlertText"></p>' +
      '<div class="choir-dialog-actions"><button type="button" class="choir-dialog-btn choir-dialog-btn--gold" id="choirDialogAlertOk">确定</button></div></div>';

    const confirm = document.createElement("div");
    confirm.id = "choirDialogConfirm";
    confirm.className = "choir-dialog-overlay";
    confirm.setAttribute("aria-hidden", "true");
    confirm.innerHTML =
      '<div class="choir-dialog-box"><h2 class="choir-dialog-title" id="choirDialogConfirmTitle">请确认</h2>' +
      '<p class="choir-dialog-text" id="choirDialogConfirmText"></p>' +
      '<div class="choir-dialog-actions"><button type="button" class="choir-dialog-btn" id="choirDialogConfirmCancel">取消</button>' +
      '<button type="button" class="choir-dialog-btn choir-dialog-btn--gold" id="choirDialogConfirmOk">确定</button></div></div>';

    const prompt = document.createElement("div");
    prompt.id = "choirDialogPrompt";
    prompt.className = "choir-dialog-overlay";
    prompt.setAttribute("aria-hidden", "true");
    prompt.innerHTML =
      '<div class="choir-dialog-box"><h2 class="choir-dialog-title" id="choirDialogPromptTitle">输入</h2>' +
      '<p class="choir-dialog-hint" id="choirDialogPromptHint" hidden></p>' +
      '<form id="choirDialogPromptForm" class="choir-dialog-form"><div><label id="choirDialogPromptLabel" for="choirDialogPromptInput">内容</label>' +
      '<input type="text" id="choirDialogPromptInput" autocomplete="off"/></div></form>' +
      '<p class="choir-dialog-error" id="choirDialogPromptError" hidden></p>' +
      '<div class="choir-dialog-actions"><button type="button" class="choir-dialog-btn" id="choirDialogPromptCancel">取消</button>' +
      '<button type="submit" form="choirDialogPromptForm" class="choir-dialog-btn choir-dialog-btn--gold" id="choirDialogPromptOk">确定</button></div></div>';

    const form = document.createElement("div");
    form.id = "choirDialogForm";
    form.className = "choir-dialog-overlay";
    form.setAttribute("aria-hidden", "true");
    form.innerHTML =
      '<div class="choir-dialog-box choir-dialog-box--wide"><h2 class="choir-dialog-title" id="choirDialogFormTitle">填写信息</h2>' +
      '<p class="choir-dialog-hint" id="choirDialogFormHint" hidden></p>' +
      '<form id="choirDialogFormEl" class="choir-dialog-form"></form>' +
      '<p class="choir-dialog-error" id="choirDialogFormError" hidden></p>' +
      '<div class="choir-dialog-actions"><button type="button" class="choir-dialog-btn" id="choirDialogFormCancel">取消</button>' +
      '<button type="submit" form="choirDialogFormEl" class="choir-dialog-btn choir-dialog-btn--gold" id="choirDialogFormOk">确定</button></div></div>';

    const video = document.createElement("div");
    video.id = "choirDialogVideo";
    video.className = "choir-dialog-overlay choir-dialog-overlay--dark";
    video.setAttribute("aria-hidden", "true");
    video.innerHTML =
      '<div class="choir-dialog-box choir-dialog-box--dark choir-dialog-box--wide choir-dialog-video-wrap">' +
      '<div class="choir-dialog-video-head"><span id="choirDialogVideoTitle">视频播放</span>' +
      '<button type="button" class="choir-dialog-video-close" id="choirDialogVideoClose" aria-label="关闭">&times;</button></div>' +
      '<iframe id="choirDialogVideoFrame" class="choir-dialog-video-frame" title="视频" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>';

    root.append(alert, confirm, prompt, form, video);
    document.body.appendChild(root);

    const toast = document.createElement("div");
    toast.id = "choirDialogToast";
    toast.setAttribute("role", "status");
    toast.hidden = true;
    document.body.appendChild(toast);

    wireStaticHandlers();
  }


  function openOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
  }

  function closeOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
  }

  function submitFormModal() {
    const err = document.getElementById("choirDialogFormError");
    const out = {};
    for (const f of formFields) {
      const el = document.getElementById("choirDialogField_" + f.key);
      const val = el ? (el.value || "").trim() : "";
      if (f.required && !val) {
        if (err) {
          err.textContent = "请填写「" + f.label + "」";
          err.hidden = false;
        }
        el?.focus();
        return;
      }
      out[f.key] = val;
    }
    closeOverlay("choirDialogForm");
    if (formResolve) {
      const fn = formResolve;
      formResolve = null;
      fn(out);
    }
  }

  function alert(message, title) {
    ensureRoot();
    return new Promise((resolve) => {
      alertResolve = resolve;
      const t = document.getElementById("choirDialogAlertTitle");
      const x = document.getElementById("choirDialogAlertText");
      if (t) t.textContent = title || "提示";
      if (x) x.textContent = String(message ?? "");
      openOverlay("choirDialogAlert");
    });
  }

  function confirm(message, title) {
    ensureRoot();
    return new Promise((resolve) => {
      confirmResolve = resolve;
      const t = document.getElementById("choirDialogConfirmTitle");
      const x = document.getElementById("choirDialogConfirmText");
      if (t) t.textContent = title || "请确认";
      if (x) x.textContent = String(message ?? "");
      openOverlay("choirDialogConfirm");
    });
  }

  function prompt(arg1, arg2) {
    const opts =
      typeof arg1 === "object"
        ? arg1
        : { label: arg1, value: arg2 ?? "", title: "输入" };
    ensureRoot();
    return new Promise((resolve) => {
      promptResolve = resolve;
      const titleEl = document.getElementById("choirDialogPromptTitle");
      const hintEl = document.getElementById("choirDialogPromptHint");
      const labelEl = document.getElementById("choirDialogPromptLabel");
      const err = document.getElementById("choirDialogPromptError");
      const ok = document.getElementById("choirDialogPromptOk");
      const cancel = document.getElementById("choirDialogPromptCancel");
      let input = document.getElementById("choirDialogPromptInput");
      const wrap = input?.parentElement;

      if (titleEl) titleEl.textContent = opts.title || "输入";
      if (hintEl) {
        if (opts.hint) {
          hintEl.textContent = opts.hint;
          hintEl.hidden = false;
        } else hintEl.hidden = true;
      }
      if (labelEl) labelEl.textContent = opts.label || "内容";

      if (wrap) {
        const multiline = !!opts.multiline;
        const needTa = multiline;
        const isTa = input?.tagName === "TEXTAREA";
        if (needTa !== isTa) {
          const field = document.createElement(needTa ? "textarea" : "input");
          field.id = "choirDialogPromptInput";
          if (!needTa) field.type = "text";
          field.autocomplete = "off";
          input.replaceWith(field);
          input = field;
        }
      }
      input = document.getElementById("choirDialogPromptInput");
      if (input) {
        input.value = opts.value ?? "";
        input.required = !!opts.required;
        if (opts.maxlength) input.maxLength = opts.maxlength;
        if (opts.placeholder) input.placeholder = opts.placeholder;
      }
      if (err) err.hidden = true;
      if (ok) ok.textContent = opts.confirmText || "确定";
      if (cancel) cancel.textContent = opts.cancelText || "取消";
      openOverlay("choirDialogPrompt");
      setTimeout(() => document.getElementById("choirDialogPromptInput")?.focus(), 60);
    });
  }

  function form(opts) {
    ensureRoot();
    return new Promise((resolve) => {
      formResolve = resolve;
      formFields = opts.fields || [];
      const titleEl = document.getElementById("choirDialogFormTitle");
      const hintEl = document.getElementById("choirDialogFormHint");
      const formEl = document.getElementById("choirDialogFormEl");
      const err = document.getElementById("choirDialogFormError");
      const ok = document.getElementById("choirDialogFormOk");
      const cancel = document.getElementById("choirDialogFormCancel");
      const box = document.querySelector("#choirDialogForm .choir-dialog-box");
      if (titleEl) titleEl.textContent = opts.title || "填写信息";
      if (hintEl) {
        if (opts.hint) {
          hintEl.textContent = opts.hint;
          hintEl.hidden = false;
        } else hintEl.hidden = true;
      }
      if (box) box.classList.toggle("choir-dialog-box--wide", opts.wide !== false);
      if (formEl) {
        formEl.innerHTML = formFields
          .map((f) => {
            const id = "choirDialogField_" + f.key;
            let control = "";
            if (f.type === "select") {
              control =
                '<select id="' +
                id +
                '"' +
                (f.required ? " required" : "") +
                ">" +
                (f.options || [])
                  .map(
                    (o) =>
                      '<option value="' +
                      esc(o.value) +
                      '"' +
                      (String(o.value) === String(f.value) ? " selected" : "") +
                      ">" +
                      esc(o.label) +
                      "</option>"
                  )
                  .join("") +
                "</select>";
            } else if (f.type === "textarea") {
              control =
                '<textarea id="' +
                id +
                '" placeholder="' +
                esc(f.placeholder || "") +
                '"' +
                (f.maxlength ? ' maxlength="' + f.maxlength + '"' : "") +
                (f.required ? " required" : "") +
                ">" +
                esc(f.value || "") +
                "</textarea>";
            } else {
              control =
                '<input type="text" id="' +
                id +
                '" value="' +
                esc(f.value || "") +
                '" placeholder="' +
                esc(f.placeholder || "") +
                '"' +
                (f.maxlength ? ' maxlength="' + f.maxlength + '"' : "") +
                (f.required ? " required" : "") +
                "/>";
            }
            return (
              '<div><label for="' +
              id +
              '">' +
              esc(f.label) +
              "</label>" +
              control +
              "</div>"
            );
          })
          .join("");
      }
      if (err) err.hidden = true;
      if (ok) ok.textContent = opts.confirmText || "确定";
      if (cancel) cancel.textContent = opts.cancelText || "取消";
      openOverlay("choirDialogForm");
      setTimeout(
        () => formEl?.querySelector("input,select,textarea")?.focus(),
        60
      );
    });
  }

  function toast(msg, isErr) {
    ensureRoot();
    const el = document.getElementById("choirDialogToast");
    if (!el) return;
    el.textContent = String(msg ?? "");
    el.className = isErr ? "show err" : "show";
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      el.hidden = true;
    }, 3200);
  }

  function openVideo(url, title) {
    ensureRoot();
    const titleEl = document.getElementById("choirDialogVideoTitle");
    const frame = document.getElementById("choirDialogVideoFrame");
    if (titleEl) titleEl.textContent = title || "视频播放";
    let embed = url || "";
    if (embed.includes("youtu.be/")) {
      embed =
        "https://www.youtube.com/embed/" +
        embed.split("youtu.be/")[1].split("?")[0] +
        "?autoplay=1";
    }
    if (frame) frame.src = embed;
    openOverlay("choirDialogVideo");
  }

  function closeVideo() {
    const frame = document.getElementById("choirDialogVideoFrame");
    if (frame) frame.src = "";
    closeOverlay("choirDialogVideo");
  }

  window.ChoirDialog = {
    alert,
    confirm,
    prompt,
    form,
    toast,
    openVideo,
    closeVideo,
    ensureStyles: injectStyles,
    voiceOptions: VOICE_OPTS,
  };
  window.openVideoModal = openVideo;
  window.closeVideoModal = closeVideo;

  /* 页面加载即注入样式，避免 app-shell 改密弹窗在首次 ChoirDialog 调用前无样式露出 */
  injectStyles();
})();
