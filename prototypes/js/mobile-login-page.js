/**
 * 手机登录页 — 接 /api/auth/login 与合唱团列表
 */
(function () {
  let captchaId = null;
  let choirs = [];

  function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }

  async function loadChoirs() {
    const data = await ChoirAPI.get("/choirs/public");
    choirs = data.choirs || [];
    const sel = document.getElementById("choir_slug");
    if (!sel) return;
    sel.innerHTML = "";
    for (const c of choirs) {
      const opt = document.createElement("option");
      opt.value = c.slug;
      opt.textContent = c.name;
      sel.appendChild(opt);
    }
  }

  async function loadCaptcha() {
    const block = document.getElementById("captcha-block");
    const img = document.getElementById("captcha_img");
    const cap = await ChoirAPI.get("/auth/captcha");
    captchaId = cap.captcha_id;
    if (img) img.src = cap.image_base64;
    if (block) block.hidden = false;
    const code = document.getElementById("captcha_code");
    if (code) code.value = "";
  }

  async function handleLogin(e) {
    e.preventDefault();
    const account = document.getElementById("account").value.trim();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("loginBtn");
    const accountGroup = document.getElementById("accountGroup");
    const passwordGroup = document.getElementById("passwordGroup");

    accountGroup?.classList.remove("has-error");
    passwordGroup?.classList.remove("has-error");

    let hasError = false;
    if (!account) {
      accountGroup?.classList.add("has-error");
      hasError = true;
    }
    if (!password) {
      passwordGroup?.classList.add("has-error");
      hasError = true;
    }
    if (hasError) return;

    const slugEl = document.getElementById("choir_slug");
    const body = { username: account, password };
    if (slugEl && slugEl.value) body.choir_slug = slugEl.value;
    if (captchaId) {
      body.captcha_id = captchaId;
      body.captcha_code = (document.getElementById("captcha_code")?.value || "").trim();
    }

    btn?.classList.add("loading");
    const prevText = btn?.textContent;
    if (btn) btn.textContent = "";

    try {
      const data = await ChoirAPI.post("/auth/login", body);
      ChoirAuth.saveSession(data);
      showToast("登录成功，正在跳转…");
      setTimeout(() => ChoirAuth.routeAfterLogin(data.user), 400);
    } catch (err) {
      showToast(err.message || "登录失败");
      if (err.status === 400 || err.status === 401) {
        try {
          await loadCaptcha();
        } catch (_) {}
      }
    } finally {
      btn?.classList.remove("loading");
      if (btn) btn.textContent = prevText || "登 录";
    }
  }

  function setup() {
    const form = document.getElementById("loginForm");
    form?.addEventListener("submit", handleLogin);
    document.getElementById("account")?.addEventListener("input", () => {
      document.getElementById("accountGroup")?.classList.remove("has-error");
    });
    document.getElementById("password")?.addEventListener("input", () => {
      document.getElementById("passwordGroup")?.classList.remove("has-error");
    });
    document.getElementById("btn-captcha-refresh")?.addEventListener("click", () => {
      loadCaptcha().catch((e) => showToast(e.message));
    });
    document.getElementById("captcha_img")?.addEventListener("click", () => {
      loadCaptcha().catch((e) => showToast(e.message));
    });

    if (ChoirAuth.getToken()) {
      ChoirAuth.refreshUser().then((u) => {
        if (u) ChoirAuth.routeAfterLogin(u);
      });
      return;
    }
    loadChoirs().catch((e) => showToast(e.message));
  }

  window.togglePassword = function togglePassword() {
    const input = document.getElementById("password");
    const icon = document.getElementById("eyeIcon");
    if (!input || !icon) return;
    if (input.type === "password") {
      input.type = "text";
      icon.innerHTML =
        '<path d="M17.9 17.4c-.4-.3-.9-.5-1.4-.6-.6-.2-1.2-.2-1.8-.2C12 16.5 9.4 14.3 8 12c1.4-2.3 4-4.5 7.2-4.5.5 0 1 .1 1.5.2.5.1 1 .3 1.4.6M1 12s4 8 11 8c1.5 0 2.9-.3 4.2-.9M1 12s4-8 11-8c1.5 0 2.9.3 4.2.9"/><line x1="3" y1="3" x2="21" y2="21"/>';
    } else {
      input.type = "password";
      icon.innerHTML =
        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  };

  window.showToast = showToast;

  document.addEventListener("DOMContentLoaded", setup);
})();
