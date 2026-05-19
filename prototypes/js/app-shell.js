/**
 * 管理端页面通用壳：鉴权、用户信息显示、改密、退出、菜单权限
 */
(function () {
  function avatarChar(name) {
    return (name || "?").charAt(0);
  }

  function injectPasswordModal() {
    if (document.getElementById("modal-password")) return;
    window.ChoirDialog?.ensureStyles?.();
    const el = document.createElement("div");
    el.id = "modal-password";
    el.className = "choir-dialog-overlay";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
  <div class="choir-dialog-box" style="width:min(400px,96%)">
    <h2 class="choir-dialog-title">修改密码</h2>
    <form id="form-password" class="choir-dialog-form">
      <div><label for="pwd-old">原密码</label>
      <input id="pwd-old" type="password" required autocomplete="current-password" /></div>
      <div><label for="pwd-new">新密码（至少8位，含字母与数字）</label>
      <input id="pwd-new" type="password" required minlength="8" autocomplete="new-password" /></div>
      <div><label for="pwd-new2">确认新密码</label>
      <input id="pwd-new2" type="password" required minlength="8" autocomplete="new-password" /></div>
      <p id="pwd-msg" class="choir-dialog-error" style="min-height:1.2em"></p>
      <div class="choir-dialog-actions" style="margin-top:0.5rem">
        <button type="button" class="choir-dialog-btn" data-close-pwd>取消</button>
        <button type="submit" class="choir-dialog-btn choir-dialog-btn--gold">保存</button>
      </div>
    </form>
  </div>`;
    document.body.appendChild(el);


    el.querySelector("[data-close-pwd]").addEventListener("click", () => {
      el.classList.remove("open"); el.setAttribute("aria-hidden", "true");
    });
    el.addEventListener("click", (e) => {
      if (e.target === el) {
        el.classList.remove("open");
        el.setAttribute("aria-hidden", "true");
      }
    });
    document.getElementById("form-password").addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("pwd-msg");
      msg.textContent = "";
      const oldP = document.getElementById("pwd-old").value;
      const n1 = document.getElementById("pwd-new").value;
      const n2 = document.getElementById("pwd-new2").value;
      if (n1 !== n2) {
        msg.textContent = "两次新密码不一致";
        return;
      }
      try {
        await ChoirAPI.put("/auth/password", { old_password: oldP, new_password: n1 });
        el.classList.remove("open"); el.setAttribute("aria-hidden", "true");
        await ChoirDialog.alert("密码已修改，请重新登录");
        ChoirAuth.logout();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  }

  function openPasswordModal() {
    injectPasswordModal();
    const el = document.getElementById("modal-password");
    document.getElementById("pwd-old").value = "";
    document.getElementById("pwd-new").value = "";
    document.getElementById("pwd-new2").value = "";
    document.getElementById("pwd-msg").textContent = "";
    el.classList.add("open"); el.setAttribute("aria-hidden", "false");
  }

  function brandTitle(user) {
    if (user?.system_super_admin) return "雅歌合唱团管理系统";
    return (
      user?.choir_name ||
      user?.choir?.name ||
      "合唱团"
    );
  }

  function fillBrandTitle(user) {
    const title = brandTitle(user);
    document.querySelectorAll(".brand-name, .brand-name-m").forEach((el) => {
      el.textContent = title;
      el.style.textTransform = "none";
      el.style.letterSpacing = "0.05em";
    });
  }

  function fillUserUI(user) {
    const name = user.name || user.username;
    const role = user.role_name || (user.system_super_admin ? "系统超管" : "成员");
    fillBrandTitle(user);
    document.querySelectorAll(".sidebar-user-name").forEach((n) => {
      n.textContent = name;
    });
    document.querySelectorAll(".sidebar-user-role").forEach((n) => {
      n.textContent = role;
    });
    document.querySelectorAll(".user-avatar, .sidebar-user-avatar, #userAvatar").forEach((n) => {
      n.textContent = avatarChar(name);
    });
  }

  function wireCommonActions() {
    if (document.body.dataset.choirShellWired === "1") return;
    document.body.dataset.choirShellWired = "1";
    document.querySelectorAll("[data-logout], #logoutBtn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        ChoirDialog.confirm("确定退出登录？", "退出登录").then((ok) => { if (ok) ChoirAuth.logout(); });
      });
    });
    document.querySelectorAll("[data-change-password], #changePwdBtn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const dd = document.getElementById("userDropdown");
        if (dd) dd.classList.remove("open");
        openPasswordModal();
      });
    });
  }

  function loadMobileSidebar() {
    const page = (location.pathname.split("/").pop() || "").split("?")[0];
    const skip = new Set([
      "极简中式-手机登录.html",
      "极简中式-手机注册.html",
      "极简中式-手机端.html",
      "极简中式-展示页.html",
      "login.html",
      "register.html",
    ]);
    if (skip.has(page)) return;
    if (!document.querySelector(".page-body > .sidebar, .page-body > aside.sidebar")) {
      return;
    }

    const run = () => window.ChoirMobileSidebar?.mount();
    if (window.ChoirMobileSidebar) {
      run();
      return;
    }
    if (document.querySelector("script[data-choir-mobile-sidebar]")) return;
    const s = document.createElement("script");
    s.src = "/js/mobile-sidebar.js?v=20260608";
    s.dataset.choirMobileSidebar = "1";
    s.onload = run;
    s.onerror = () => {};
    document.body.appendChild(s);
  }

  function loadMobileTabbar(user) {
    const page = (location.pathname.split("/").pop() || "").split("?")[0];
    const skip = new Set([
      "极简中式-手机登录.html",
      "极简中式-手机注册.html",
      "极简中式-手机端.html",
      "极简中式-展示页.html",
      "login.html",
      "register.html",
    ]);
    if (skip.has(page)) return;
    if (document.querySelector(".phone-frame .tab-bar")) return;

    const run = () => window.ChoirMobileTabbar?.mount(user);
    if (window.ChoirMobileTabbar) {
      run();
      return;
    }
    if (document.querySelector("script[data-choir-mobile-tabbar]")) return;
    const s = document.createElement("script");
    s.src = "/js/mobile-tabbar.js?v=20260528";
    s.dataset.choirMobileTabbar = "1";
    s.onload = run;
    s.onerror = () => {};
    document.body.appendChild(s);
  }

  async function init(opts = {}) {
    if (!ChoirAuth.requireAuth()) return null;
    const user = await ChoirAuth.refreshUser();
    if (!user) {
      location.href = ChoirAuth.loginPath();
      return null;
    }
    if (opts.systemAdminOnly && !user.system_super_admin) {
      ChoirDialog.alert("仅系统超管可访问此页面");
      location.href = (window.CHOIR_UI_BASE || "/ui/") + "极简中式-桌面端.html";
      return null;
    }
    if (opts.requiredPerm && !ChoirAuth.hasPermission(user, opts.requiredPerm)) {
      ChoirDialog.alert("无权限访问此页面");
      location.href = (window.CHOIR_UI_BASE || "/ui/") + "极简中式-桌面端.html";
      return null;
    }
    injectPasswordModal();
    fillUserUI(user);
    wireCommonActions();
    if (window.ChoirPermissions) {
      ChoirPermissions.applyNavPermissions(user);
    }
    loadMobileSidebar();
    loadMobileTabbar(user);
    if (typeof opts.onReady === "function") opts.onReady(user);
    return user;
  }

  window.ChoirAppShell = {
    init,
    fillUserUI,
    fillBrandTitle,
    brandTitle,
    openPasswordModal,
  };
})();
