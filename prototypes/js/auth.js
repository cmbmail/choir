(function () {
  function saveSession(payload) {
    if (payload.access_token) {
      localStorage.setItem("access_token", payload.access_token);
    }
    if (payload.user) {
      localStorage.setItem("current_user", JSON.stringify(payload.user));
    }
  }

  function clearSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("current_user");
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("current_user") || "null");
    } catch {
      return null;
    }
  }

  function routeAfterLogin(user) {
    const code = user.role_code || "member";
    const adminCodes = ["super_admin", "conductor", "class_leader", "general_affairs", "section_leader"];
    const uiBase = window.CHOIR_UI_BASE || "/ui/";
    if (user.system_super_admin) {
      window.location.href = uiBase + "极简中式-系统管理.html";
      return;
    }
    if (adminCodes.includes(code)) {
      window.location.href = uiBase + "极简中式-桌面端.html";
    } else {
      window.location.href = uiBase + "极简中式-团员前台.html";
    }
  }

  window.ChoirAuth = { saveSession, clearSession, getUser, routeAfterLogin };
})();
