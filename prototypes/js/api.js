(function () {
  const API_BASE = window.CHOIR_API_BASE || "http://127.0.0.1:5000/api";
  let csrfToken = sessionStorage.getItem("csrf_token") || null;

  function getToken() {
    return localStorage.getItem("access_token");
  }

  function readCookie(name) {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function getCsrfToken() {
    return csrfToken || readCookie("csrf_token");
  }

  function setCsrfToken(token) {
    if (!token) return;
    csrfToken = token;
    sessionStorage.setItem("csrf_token", token);
  }

  async function fetchCsrf() {
    const res = await fetch(`${API_BASE}/auth/csrf`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.csrf_token) {
      setCsrfToken(data.csrf_token);
    }
    return data.csrf_token || getCsrfToken();
  }

  async function api(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      let csrf = getCsrfToken();
      if (!csrf) {
        try {
          csrf = await fetchCsrf();
        } catch (_) {}
      }
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.ChoirAPI = {
    base: API_BASE,
    get: (p) => api(p),
    post: (p, body) => api(p, { method: "POST", body: JSON.stringify(body) }),
    put: (p, body) => api(p, { method: "PUT", body: JSON.stringify(body) }),
    patch: (p, body) => api(p, { method: "PATCH", body: JSON.stringify(body) }),
    del: (p) => api(p, { method: "DELETE" }),
    fetchCsrf,
    setCsrfToken,
    getCsrfToken,
  };
})();
