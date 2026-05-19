/**
 * 阶段一菜单权限：按 data-perm / data-admin-only 控制可见性
 */
(function () {
  const SIDEBAR_LINKS = {
    "极简中式-桌面端.html": null,
    "极简中式-排练计划.html": null,
    "极简中式-献唱计划.html": null,
    "极简中式-作业提交.html": null,
    "极简中式-成员管理.html": "members.read",
    "极简中式-系统管理.html": "__system_admin__",
    "极简中式-资料管理.html": "documents.read",
    "极简中式-录音管理.html": "recordings.read",
    "极简中式-项目管理.html": "projects.read",
  };

  function canAccess(user, perm) {
    if (!perm) return true;
    if (perm === "__system_admin__") return !!user?.system_super_admin;
    return window.ChoirAuth?.hasPermission(user, perm);
  }

  function applyNavPermissions(user) {
    document.querySelectorAll(".sidebar-item[href], .nav-item[href]").forEach((el) => {
      const href = el.getAttribute("href") || "";
      const file = href.split("/").pop();
      const perm = SIDEBAR_LINKS[file];
      if (perm === undefined) return;
      if (!canAccess(user, perm)) {
        el.style.display = "none";
      }
    });

    document.querySelectorAll("[data-perm]").forEach((el) => {
      const perm = el.getAttribute("data-perm");
      el.hidden = !canAccess(user, perm);
    });

    document.querySelectorAll("[data-admin-only]").forEach((el) => {
      el.hidden = !user?.system_super_admin;
    });
  }

  window.ChoirPermissions = {
    applyNavPermissions,
    canAccess,
    SIDEBAR_LINKS,
  };
})();
