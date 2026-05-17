/**
 * 手机注册页 — 邀请码校验与注册
 */
(function () {
  let previewTimer = null;
  let choirName = null;

  function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function setWelcomePending() {
    choirName = null;
    const sub = document.getElementById("welcome-sub");
    if (!sub) return;
    sub.textContent = "请输入邀请码，验证后将显示团队名称";
    sub.classList.remove("welcome-ready");
  }

  function setWelcomeReady(name) {
    choirName = name;
    const sub = document.getElementById("welcome-sub");
    if (!sub) return;
    sub.textContent = `欢迎您加入「${name}」`;
    sub.classList.add("welcome-ready");
  }

  async function previewInvite() {
    const input = document.getElementById("invite_code");
    const code = (input?.value || "").trim();
    if (code.length < 8) {
      setWelcomePending();
      return;
    }
    try {
      const data = await ChoirAPI.get(`/auth/invite-preview?code=${encodeURIComponent(code)}`);
      setWelcomeReady(data.choir_name);
    } catch {
      choirName = null;
      const sub = document.getElementById("welcome-sub");
      if (sub) {
        sub.textContent = "邀请码无效或已过期，请核对后重试";
        sub.classList.remove("welcome-ready");
      }
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const inviteInput = document.getElementById("invite_code");
    const phoneInput = document.getElementById("phone");
    const nameInput = document.getElementById("name");
    const passwordInput = document.getElementById("password");
    const inviteGroup = document.getElementById("inviteGroup");
    const phoneGroup = document.getElementById("phoneGroup");
    const nameGroup = document.getElementById("nameGroup");
    const passwordGroup = document.getElementById("passwordGroup");
    const btn = document.getElementById("registerBtn");

    [inviteGroup, phoneGroup, nameGroup, passwordGroup].forEach((g) => g?.classList.remove("has-error"));

    const code = (inviteInput?.value || "").trim();
    const phone = (phoneInput?.value || "").trim();
    const name = (nameInput?.value || "").trim();
    const password = passwordInput?.value || "";

    if (code.length !== 8) {
      inviteGroup?.classList.add("has-error");
      return;
    }
    if (!phone) {
      phoneGroup?.classList.add("has-error");
      return;
    }
    if (!name) {
      nameGroup?.classList.add("has-error");
      return;
    }
    if (!password) {
      passwordGroup?.classList.add("has-error");
      return;
    }

    if (!choirName) await previewInvite();
    if (!choirName) {
      showToast("邀请码无效或已过期");
      return;
    }

    btn?.classList.add("loading");
    const prevText = btn?.textContent;
    if (btn) btn.textContent = "";
    try {
      await ChoirAPI.post("/auth/register", {
        invite_code: code,
        username: phone,
        name,
        password,
      });
      showToast("注册成功，正在跳转登录…");
      const loginUrl = window.ChoirAuth?.loginPath?.() || "/login.html";
      setTimeout(() => {
        location.href = loginUrl;
      }, 800);
    } catch (err) {
      showToast(err.message || "注册失败");
    } finally {
      btn?.classList.remove("loading");
      if (btn) btn.textContent = prevText || "注 册";
    }
  }

  function setup() {
    const params = new URLSearchParams(location.search);
    const inviteInput = document.getElementById("invite_code");
    if (params.get("code") && inviteInput) {
      inviteInput.value = params.get("code");
      if (inviteInput.value.trim().length === 8) previewInvite();
    }

    inviteInput?.addEventListener("input", () => {
      clearTimeout(previewTimer);
      document.getElementById("inviteGroup")?.classList.remove("has-error");
      if ((inviteInput.value || "").trim().length < 8) {
        setWelcomePending();
        return;
      }
      previewTimer = setTimeout(previewInvite, 400);
    });

    document.getElementById("registerForm")?.addEventListener("submit", handleRegister);
    document.getElementById("phone")?.addEventListener("input", () => {
      document.getElementById("phoneGroup")?.classList.remove("has-error");
    });
    document.getElementById("name")?.addEventListener("input", () => {
      document.getElementById("nameGroup")?.classList.remove("has-error");
    });
    document.getElementById("password")?.addEventListener("input", () => {
      document.getElementById("passwordGroup")?.classList.remove("has-error");
    });

    document.querySelector(".login-link")?.addEventListener("click", () => {
      location.href = window.ChoirAuth?.loginPath?.() || "/login.html";
    });
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
