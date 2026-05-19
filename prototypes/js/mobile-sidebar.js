/**
 * 管理壳窄屏：侧栏默认收起，点击顶栏左上角图标滑出
 */
(function () {
  const MQ = "(max-width: 1200px)";

  function injectStyles() {
    if (document.getElementById("choir-mobile-sidebar-style")) return;
    const el = document.createElement("style");
    el.id = "choir-mobile-sidebar-style";
    el.textContent = `
.choir-sidebar-toggle{
  display:none;
  flex-shrink:0;
  width:40px;height:40px;
  margin-right:0.35rem;
  border:1px solid rgba(184,134,11,0.35);
  border-radius:4px;
  color:var(--ink-gold,#B8860B);
  background:transparent;
  place-items:center;
  transition:background 0.2s ease,border-color 0.2s ease;
}
.choir-sidebar-toggle svg{
  width:20px;height:20px;
  stroke:currentColor;fill:none;
  stroke-width:2;stroke-linecap:round;
}
.choir-sidebar-toggle:hover{
  background:rgba(184,134,11,0.12);
  border-color:var(--ink-gold,#B8860B);
}
.choir-sidebar-backdrop{display:none}

@media (max-width:1200px){
  .choir-sidebar-toggle{display:grid}
  .choir-sidebar-backdrop{
    display:block;
    position:fixed;
    top:64px;left:0;right:0;bottom:0;
    z-index:155;
    background:rgba(28,28,28,0.45);
    opacity:0;
    visibility:hidden;
    transition:opacity 0.25s ease,visibility 0.25s ease;
  }
  body.choir-mobile-drawer.sidebar-open .choir-sidebar-backdrop{
    opacity:1;
    visibility:visible;
  }
  body.choir-mobile-drawer .page-body > .sidebar,
  body.choir-mobile-drawer .page-body > aside.sidebar{
    display:flex!important;
    flex-direction:column!important;
    position:fixed!important;
    top:64px!important;
    left:0!important;
    bottom:0!important;
    width:min(280px,85vw)!important;
    min-width:0!important;
    max-width:85vw!important;
    height:auto!important;
    z-index:160!important;
    margin:0!important;
    border-right:1px solid var(--border,rgba(28,28,28,0.1))!important;
    box-shadow:none;
    transform:translateX(-105%);
    transition:transform 0.25s ease,box-shadow 0.25s ease;
    overflow:hidden;
  }
  body.choir-mobile-drawer.sidebar-open .page-body > .sidebar,
  body.choir-mobile-drawer.sidebar-open .page-body > aside.sidebar{
    transform:translateX(0);
    box-shadow:4px 0 24px rgba(28,28,28,0.18);
  }
  body.choir-mobile-drawer .page-body{
    flex-direction:column;
  }
}
`;
    document.head.appendChild(el);
  }

  function hamburgerSvg() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<line x1="4" y1="7" x2="20" y2="7"/>' +
      '<line x1="4" y1="12" x2="20" y2="12"/>' +
      '<line x1="4" y1="17" x2="20" y2="17"/>' +
      "</svg>"
    );
  }

  function mount() {
    const sidebar = document.querySelector(
      ".page-body > .sidebar, .page-body > aside.sidebar"
    );
    const topbar = document.querySelector("header.topbar, .topbar");
    if (!sidebar || !topbar) return false;

    injectStyles();
    document.body.classList.add("choir-mobile-drawer");
    sidebar.removeAttribute("hidden");

    let backdrop = document.querySelector(".choir-sidebar-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "choir-sidebar-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      document.body.appendChild(backdrop);
    }

    let toggle = topbar.querySelector(".choir-sidebar-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "choir-sidebar-toggle";
      toggle.setAttribute("aria-label", "打开菜单");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "choir-app-sidebar");
      toggle.innerHTML = hamburgerSvg();
      topbar.insertBefore(toggle, topbar.firstChild);
    }

    if (!sidebar.id) sidebar.id = "choir-app-sidebar";
    sidebar.setAttribute("aria-hidden", "true");

    const mq = window.matchMedia(MQ);

    function isOpen() {
      return document.body.classList.contains("sidebar-open");
    }

    function open() {
      if (!mq.matches) return;
      document.body.classList.add("sidebar-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "关闭菜单");
      sidebar.setAttribute("aria-hidden", "false");
      backdrop.setAttribute("aria-hidden", "false");
    }

    function close() {
      document.body.classList.remove("sidebar-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "打开菜单");
      if (mq.matches) sidebar.setAttribute("aria-hidden", "true");
      backdrop.setAttribute("aria-hidden", "true");
    }

    function onToggleClick() {
      if (isOpen()) close();
      else open();
    }

    if (!toggle.dataset.choirSidebarBound) {
      toggle.dataset.choirSidebarBound = "1";
      toggle.addEventListener("click", onToggleClick);
      backdrop.addEventListener("click", close);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen()) close();
      });
      mq.addEventListener("change", (e) => {
        if (!e.matches) close();
      });
      sidebar.querySelectorAll(".sidebar-item[href]").forEach((link) => {
        link.addEventListener("click", () => {
          if (mq.matches) close();
        });
      });
    }

    if (!mq.matches) close();
    return true;
  }

  window.ChoirMobileSidebar = { mount, MQ };
})();
