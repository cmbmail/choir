/**
 * 管理端手机底部 Tab（侧栏隐藏时显示）
 */
(function () {
  const SKIP_PAGES = new Set([
    "极简中式-手机登录.html",
    "极简中式-手机注册.html",
    "极简中式-手机端.html",
    "极简中式-展示页.html",
    "login.html",
    "register.html",
  ]);

  const TABS = [
    {
      id: "home",
      label: "首页",
      href: "极简中式-桌面端.html",
      perm: null,
      match: ["极简中式-桌面端.html"],
      icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    },
    {
      id: "rehearsal",
      label: "排练",
      href: "极简中式-排练计划.html",
      perm: null,
      match: [
        "极简中式-排练计划.html",
        "极简中式-献唱计划.html",
        "极简中式-作业提交.html",
      ],
      icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    },
    {
      id: "docs",
      label: "资料",
      href: "极简中式-资料管理.html",
      perm: "documents.read",
      match: [
        "极简中式-资料管理.html",
        "极简中式-乐谱详情.html",
        "极简中式-作品管理.html",
      ],
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    },
    {
      id: "records",
      label: "录音",
      href: "极简中式-录音管理.html",
      perm: "recordings.read",
      match: ["极简中式-录音管理.html"],
      icon: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
    },
    {
      id: "more",
      label: "更多",
      href: null,
      perm: null,
      match: [
        "极简中式-成员管理.html",
        "极简中式-系统管理.html",
        "极简中式-管理员后台.html",
      ],
      icon: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    },
  ];

  function currentFile() {
    return (location.pathname.split("/").pop() || "").split("?")[0];
  }

  function canAccess(user, perm) {
    if (!perm) return true;
    if (perm === "__system_admin__") return !!user?.system_super_admin;
    return window.ChoirAuth?.hasPermission(user, perm);
  }

  function resolveHref(tab, user) {
    if (tab.id !== "more") return tab.href;
    if (user?.system_super_admin) return "极简中式-系统管理.html";
    if (canAccess(user, "members.read")) return "极简中式-成员管理.html";
    return "极简中式-桌面端.html";
  }

  function isActive(tab, file) {
    return tab.match.includes(file);
  }

  function injectStyles() {
    if (document.getElementById("choir-mobile-tabbar-style")) return;
    const el = document.createElement("style");
    el.id = "choir-mobile-tabbar-style";
    el.textContent = `
.choir-mobile-tabbar{
  display:none;
  position:fixed;
  left:0;right:0;bottom:0;
  z-index:450;
  height:calc(56px + env(safe-area-inset-bottom,0px));
  padding-bottom:env(safe-area-inset-bottom,0px);
  background:#1C1C1C;
  border-top:1px solid rgba(184,134,11,0.25);
  box-shadow:0 -4px 20px rgba(0,0,0,0.12);
}
.choir-mobile-tabbar__inner{
  display:flex;
  align-items:stretch;
  height:56px;
  max-width:100%;
}
.choir-mobile-tabbar__item{
  flex:1;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:3px;
  color:rgba(255,255,255,0.45);
  text-decoration:none;
  position:relative;
  -webkit-tap-highlight-color:transparent;
  min-width:0;
  padding:0 2px;
}
.choir-mobile-tabbar__item svg{
  width:22px;height:22px;
  stroke:currentColor;fill:none;
  stroke-width:1.75;
  stroke-linecap:round;stroke-linejoin:round;
}
.choir-mobile-tabbar__item span{
  font-size:0.6rem;
  letter-spacing:0.04em;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width:100%;
}
.choir-mobile-tabbar__item.active{
  color:#B8860B;
}
.choir-mobile-tabbar__item.active::before{
  content:'';
  position:absolute;
  top:0;left:50%;
  transform:translateX(-50%);
  width:28px;height:2px;
  background:#B8860B;
  border-radius:0 0 2px 2px;
}
@media (max-width:1200px){
  .choir-mobile-tabbar{display:block}
  body.has-mobile-tabbar .content{
    padding-bottom:calc(4.5rem + env(safe-area-inset-bottom,0px)) !important;
  }
  body.has-mobile-tabbar .detail-panel{
    padding-bottom:calc(4.5rem + env(safe-area-inset-bottom,0px));
  }
}
`;
    document.head.appendChild(el);
  }

  function shouldSkip() {
    const file = currentFile();
    if (SKIP_PAGES.has(file)) return true;
    if (document.querySelector(".phone-frame .tab-bar")) return true;
    return false;
  }

  function mount(user) {
    if (shouldSkip()) return;
    injectStyles();

    let bar = document.getElementById("choir-mobile-tabbar");
    if (!bar) {
      bar = document.createElement("nav");
      bar.id = "choir-mobile-tabbar";
      bar.className = "choir-mobile-tabbar";
      bar.setAttribute("aria-label", "主导航");
      document.body.appendChild(bar);
    }

    const file = currentFile();
    const visible = TABS.filter((tab) => {
      if (tab.id === "more") {
        if (user?.system_super_admin) return true;
        return canAccess(user, "members.read");
      }
      return canAccess(user, tab.perm);
    });

    if (!visible.length) return;

    const inner = document.createElement('div');
    inner.className = "choir-mobile-tabbar__inner";
    inner.innerHTML = visible
      .map((tab) => {
        const href = resolveHref(tab, user);
        const active = isActive(tab, file) ? " active" : "";
        return (
          '<a class="choir-mobile-tabbar__item' +
          active +
          '" href="' +
          href +
          '">' +
          "<svg viewBox=\"0 0 24 24\">" +
          tab.icon +
          "</svg><span>" +
          tab.label +
          "</span></a>"
        );
      })
      .join("");

    bar.innerHTML = "";
    bar.appendChild(inner);
    document.body.classList.add("has-mobile-tabbar");
  }

  window.ChoirMobileTabbar = { mount };
})();
