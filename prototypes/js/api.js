(function () {
  const API_BASE = window.CHOIR_API_BASE || "http://127.0.0.1:5000/api";

  function getToken() {
    return localStorage.getItem("access_token");
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
    del: (p) => api(p, { method: "DELETE" }),
  };
})();
