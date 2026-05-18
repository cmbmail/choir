/**
 * 手机端壳：鉴权、头像、改密、退出
 */
(function () {
  function avatarChar(name) {
    return (name || "?").charAt(0);
  }

  function fillUserUI(user) {
    if (window.ChoirAppShell?.fillBrandTitle) {
      ChoirAppShell.fillBrandTitle(user);
    }
    const name = user.name || user.username;
    document.querySelectorAll(".avatar-m, .profile-avatar").forEach((el) => {
      el.textContent = avatarChar(name);
    });
    const profileName = document.querySelector(".profile-name");
    if (profileName) profileName.textContent = name;
    const profileRole = document.querySelector(".profile-role-badge");
    if (profileRole) {
      const part = user.part_label || user.voice_part || "";
      profileRole.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> ' +
        (user.role_name || "团员") +
        (part ? " · " + part : "");
    }
  }

  function wireProfileActions() {
    document.querySelectorAll(".menu-row").forEach((row) => {
      const label = row.querySelector(".menu-row-label")?.textContent?.trim();
      if (label === "修改密码") {
        row.dataset.changePassword = "1";
        row.style.cursor = "pointer";
        row.addEventListener("click", () => ChoirAppShell.openPasswordModal());
      }
      if (label === "退出登录") {
        row.dataset.logout = "1";
        row.style.cursor = "pointer";
        row.addEventListener("click", (e) => {
          e.preventDefault();
          if (confirm("确定退出登录？")) ChoirAuth.logout();
        });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ChoirAppShell.init({
      onReady(user) {
        fillUserUI(user);
        wireProfileActions();
      },
    });
  });
})();
