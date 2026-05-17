/**
 * 手机登录页 — 验证后按身份登录
 */
(function () {
  let captchaId = null;

  function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function loginBody(account, password, userId) {
    const body = { username: account, password };
    if (userId) body.user_id = userId;
    if (captchaId) {
      body.captcha_id = captchaId;
      body.captcha_code = (document.getElementById("captcha_code")?.value || "").trim();
    }
    return body;
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

  function showIdentityPicker(identities, account, password) {
    const form = document.getElementById("loginForm");
    const picker = document.getElementById("identity-picker-mobile");
    const list = document.getElementById("identity-list-mobile");
    if (!picker || !list) return;
    form.hidden = true;
    picker.hidden = false;
    list.innerHTML = identities
      .map(
        (item) => `
      <button type="button" class="identity-card-mobile" data-user-id="${item.user_id}">
        <span class="identity-card-kind">${item.kind === "system" ? "系统" : "合唱团"}</span>
        <span>${item.label}</span>
      </button>`
      )
      .join("");
    list.querySelectorAll(".identity-card-mobile").forEach((btn) => {
      btn.addEventListener("click", () => {
        doLogin(account, password, +btn.dataset.userId);
      });
    });
  }

  async function doLogin(account, password, userId) {
    const btn = document.getElementById("loginBtn");
    btn?.classList.add("loading");
    const prevText = btn?.textContent;
    if (btn) btn.textContent = "";
    try {
      const data = await ChoirAPI.post("/auth/login", loginBody(account, password, userId));
      if (data.need_identity_select && data.identities?.length) {
        if (data.identities.length === 1) {
          return doLogin(account, password, data.identities[0].user_id);
        }
        showIdentityPicker(data.identities, account, password);
        return;
      }
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

  async function handleLogin(e) {
    e.preventDefault();
    const account = document.getElementById("account").value.trim();
    const password = document.getElementById("password").value;
    const accountGroup = document.getElementById("accountGroup");
    const passwordGroup = document.getElementById("passwordGroup");

    accountGroup?.classList.remove("has-error");
    passwordGroup?.classList.remove("has-error");

    if (!account) {
      accountGroup?.classList.add("has-error");
      return;
    }
    if (!password) {
      passwordGroup?.classList.add("has-error");
      return;
    }
    await doLogin(account, password);
  }

  function setup() {
    document.getElementById("loginForm")?.addEventListener("submit", handleLogin);
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
    document.getElementById("btn-back-login-mobile")?.addEventListener("click", () => {
      document.getElementById("loginForm").hidden = false;
      document.getElementById("identity-picker-mobile").hidden = true;
    });

    if (ChoirAuth.getToken()) {
      ChoirAuth.refreshUser().then((u) => {
        if (u) ChoirAuth.routeAfterLogin(u);
      });
    }
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
