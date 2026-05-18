/**
 * 登录页：保存账号列表、可选记住密码、下拉选择
 */
(function () {
  const STORAGE_KEY = "choir_login_accounts";
  const MAX_ACCOUNTS = 12;

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveAll(list) {
    const sorted = list
      .filter((a) => a && a.username)
      .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
      .slice(0, MAX_ACCOUNTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  }

  function normalizeUsername(value) {
    return String(value || "").trim();
  }

  function maskUsername(username) {
    const u = normalizeUsername(username);
    if (/^\d{8,15}$/.test(u)) {
      return u.length >= 11
        ? u.slice(0, 3) + "****" + u.slice(-4)
        : u.slice(0, 2) + "****" + u.slice(-2);
    }
    if (u.includes("@")) {
      const [local, domain] = u.split("@");
      const head = local.length <= 2 ? local[0] : local.slice(0, 2);
      return head + "***@" + domain;
    }
    return u;
  }

  function displayLabel(acc) {
    return acc.label || maskUsername(acc.username) || acc.username;
  }

  function get(username) {
    const u = normalizeUsername(username);
    if (!u) return null;
    return loadAll().find((a) => a.username === u) || null;
  }

  function getLastUsed() {
    const list = loadAll();
    return list.length ? list[0] : null;
  }

  function upsert(username, password, rememberPassword) {
    const u = normalizeUsername(username);
    if (!u) return;
    const remember = !!rememberPassword;
    const list = loadAll().filter((a) => a.username !== u);
    list.unshift({
      username: u,
      rememberPassword: remember,
      password: remember ? String(password || "") : "",
      lastUsedAt: Date.now(),
    });
    saveAll(list);
  }

  function mount(opts) {
    const usernameInput = opts.usernameInput;
    const passwordInput = opts.passwordInput;
    const selectEl = opts.selectEl;
    const rememberEl = opts.rememberEl;

    function fillSelect() {
      if (!selectEl) return;
      const labelEl =
        document.querySelector('label[for="saved-account-select"]') ||
        document.getElementById("saved-account-label");
      const list = loadAll();
      if (!list.length) {
        selectEl.hidden = true;
        selectEl.innerHTML = "";
        if (labelEl) labelEl.hidden = true;
        return;
      }
      selectEl.hidden = false;
      if (labelEl) labelEl.hidden = false;
      const options = [
        '<option value="">选择已保存账号</option>',
        ...list.map(
          (a) =>
            '<option value="' +
            encodeURIComponent(a.username) +
            '">' +
            displayLabel(a).replace(/&/g, "&amp;").replace(/</g, "&lt;") +
            "</option>"
        ),
        '<option value="__new__">+ 使用新账号</option>',
      ];
      selectEl.innerHTML = options.join("");
    }

    function applyAccount(username) {
      const u = normalizeUsername(username);
      if (usernameInput) usernameInput.value = u;
      const acc = get(u);
      if (passwordInput) {
        passwordInput.value =
          acc && acc.rememberPassword ? acc.password || "" : "";
      }
      if (rememberEl) {
        rememberEl.checked = !!(acc && acc.rememberPassword);
      }
      if (selectEl && u) {
        const encoded = encodeURIComponent(u);
        const has = loadAll().some((a) => a.username === u);
        selectEl.value = has ? encoded : "__new__";
      }
    }

    function syncSelectFromInput() {
      if (!selectEl) return;
      const u = normalizeUsername(usernameInput?.value);
      if (!u) {
        selectEl.value = "";
        return;
      }
      if (get(u)) {
        selectEl.value = encodeURIComponent(u);
      } else {
        selectEl.value = "__new__";
      }
    }

    function init() {
      fillSelect();
      const last = getLastUsed();
      if (last) {
        applyAccount(last.username);
      }
    }

    selectEl?.addEventListener("change", () => {
      const v = selectEl.value;
      if (!v) return;
      if (v === "__new__") {
        if (usernameInput) usernameInput.value = "";
        if (passwordInput) passwordInput.value = "";
        if (rememberEl) rememberEl.checked = false;
        usernameInput?.focus();
        return;
      }
      applyAccount(decodeURIComponent(v));
    });

    usernameInput?.addEventListener("input", () => {
      syncSelectFromInput();
      const u = normalizeUsername(usernameInput.value);
      const acc = get(u);
      if (acc && acc.rememberPassword && passwordInput) {
        passwordInput.value = acc.password || "";
        if (rememberEl) rememberEl.checked = true;
      }
    });

    return {
      init,
      refresh: fillSelect,
      saveAfterLogin(username, password) {
        const remember = rememberEl ? rememberEl.checked : false;
        upsert(username, password, remember);
        fillSelect();
      },
    };
  }

  window.ChoirLoginAccounts = {
    loadAll,
    upsert,
    get,
    getLastUsed,
    mount,
    displayLabel,
  };
})();
