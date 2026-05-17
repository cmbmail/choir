(function () {
  const TOKEN_KEY = "access_token";
  const USER_KEY = "current_user";

  function apiBase() {
    if (window.CHOIR_API_BASE) return window.CHOIR_API_BASE;
    if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") {
      return "/api";
    }
    return "http://127.0.0.1:5000/api";
  }

  function isMobileDevice() {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia("(max-width: 768px)").matches)
    );
  }

  function uiBase() {
    return window.CHOIR_UI_BASE || "/ui/";
  }

  function loginPath() {
    if (isMobileDevice()) {
      return uiBase() + "极简中式-手机登录.html";
    }
    if (location.pathname.includes("/ui/")) return "/login.html";
    return "login.html";
  }

  function saveSession(payload) {
    if (payload.access_token) localStorage.setItem(TOKEN_KEY, payload.access_token);
    if (payload.user) localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    if (payload.csrf_token && window.ChoirAPI?.setCsrfToken) {
      ChoirAPI.setCsrfToken(payload.csrf_token);
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem("csrf_token");
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  async function refreshUser() {
    const token = getToken();
    if (!token) return null;
    const res = await fetch(`${apiBase()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const user = await res.json();
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  function requireAuth() {
    if (!getToken()) {
      location.href = loginPath();
      return false;
    }
    return true;
  }

  function hasPermission(user, key) {
    if (!user) return false;
    if (user.system_super_admin) return true;
    const perms = user.permissions || [];
    if (perms.includes("*")) return true;
    if (perms.includes(key)) return true;
    const prefix = key.split(".")[0] + ".*";
    return perms.includes(prefix);
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
      window.location.href = uiBase + "极简中式-手机端.html";
    }
  }

  async function logout() {
    try {
      if (window.ChoirAPI) {
        await ChoirAPI.post("/auth/logout", {});
      } else {
        await fetch(`${apiBase()}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          credentials: "include",
        });
      }
    } catch (_) {}
    clearSession();
    location.href = loginPath();
  }

  window.ChoirAuth = {
    saveSession,
    clearSession,
    getToken,
    getUser,
    refreshUser,
    requireAuth,
    hasPermission,
    routeAfterLogin,
    logout,
    apiBase,
  };
})();
