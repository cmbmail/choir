/**
 * 管理端页面通用壳：鉴权、用户信息显示、改密、退出、菜单权限
 */
(function () {
  function avatarChar(name) {
    return (name || "?").charAt(0);
  }

  function injectPasswordModal() {
    if (document.getElementById("modal-password")) return;
    const el = document.createElement("div");
    el.id = "modal-password";
    el.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center;z-index:900;padding:1rem";
    el.innerHTML = `
  <div style="background:#F8F6F0;border:1px solid rgba(28,28,28,0.1);border-radius:8px;padding:1.5rem;width:min(400px,96%)">
    <h2 style="font-size:1.1rem;font-weight:400;margin-bottom:1rem">修改密码</h2>
    <form id="form-password">
      <label style="display:block;font-size:0.8rem;margin:0.5rem 0 0.25rem">原密码</label>
      <input id="pwd-old" type="password" required style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:4px;margin-bottom:0.5rem" />
      <label style="display:block;font-size:0.8rem;margin:0.5rem 0 0.25rem">新密码（至少8位，含字母与数字）</label>
      <input id="pwd-new" type="password" required minlength="8" style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:4px;margin-bottom:0.5rem" />
      <label style="display:block;font-size:0.8rem;margin:0.5rem 0 0.25rem">确认新密码</label>
      <input id="pwd-new2" type="password" required minlength="8" style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:4px;margin-bottom:0.5rem" />
      <p id="pwd-msg" style="font-size:0.8rem;color:#b03030;min-height:1.2em"></p>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.75rem">
        <button type="button" data-close-pwd style="padding:0.5rem 1rem;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer">取消</button>
        <button type="submit" style="padding:0.5rem 1rem;border:none;border-radius:4px;background:#B8860B;color:#fff;cursor:pointer">保存</button>
      </div>
    </form>
  </div>`;
    document.body.appendChild(el);

    el.querySelector("[data-close-pwd]").addEventListener("click", () => {
      el.style.display = "none";
    });
    el.addEventListener("click", (e) => {
      if (e.target === el) el.style.display = "none";
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
        el.style.display = "none";
        alert("密码已修改，请重新登录");
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
    el.style.display = "flex";
  }

  function fillUserUI(user) {
    const name = user.name || user.username;
    const role = user.role_name || (user.system_super_admin ? "系统超管" : "成员");
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
        if (confirm("确定退出登录？")) ChoirAuth.logout();
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
      alert("仅系统超管可访问此页面");
      location.href = (window.CHOIR_UI_BASE || "/ui/") + "极简中式-桌面端.html";
      return null;
    }
    if (opts.requiredPerm && !ChoirAuth.hasPermission(user, opts.requiredPerm)) {
      alert("无权限访问此页面");
      location.href = (window.CHOIR_UI_BASE || "/ui/") + "极简中式-桌面端.html";
      return null;
    }
    injectPasswordModal();
    fillUserUI(user);
    wireCommonActions();
    if (window.ChoirPermissions) {
      ChoirPermissions.applyNavPermissions(user);
    }
    loadMobileTabbar(user);
    if (typeof opts.onReady === "function") opts.onReady(user);
    return user;
  }

  window.ChoirAppShell = {
    init,
    fillUserUI,
    openPasswordModal,
  };
})();
