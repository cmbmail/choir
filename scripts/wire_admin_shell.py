#!/usr/bin/env python3
"""Wire app-shell scripts onto 古典系 admin HTML pages."""
import re
from pathlib import Path

UI_DIR = Path(__file__).resolve().parents[1] / "2026-05-16-task-13" / "古典系"

API_HEAD = """  <script>
    if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") {
      window.CHOIR_API_BASE = "/api";
      window.CHOIR_UI_BASE = "/ui/";
    }
  </script>
"""

SHELL_SCRIPTS = """
<script src="/js/api.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/permissions.js"></script>
<script src="/js/ui-common.js"></script>
<script src="/js/app-shell.js"></script>
<script>document.addEventListener("DOMContentLoaded", () => {
  ChoirUI.initUserDropdown();
  ChoirAppShell.init();
});</script>
"""

USER_DROPDOWN_BLOCK = re.compile(
    r"\n// User dropdown\nconst userDropdown = document\.getElementById\('userDropdown'\);\n"
    r"userDropdown\.querySelector\('\.user-avatar'\)\.addEventListener\('click', e => \{\n"
    r"  e\.stopPropagation\(\);\n"
    r"  userDropdown\.classList\.toggle\('open'\);\n"
    r"\}\);\n"
    r"document\.addEventListener\('click', \(\) => userDropdown\.classList\.remove\('open'\)\);\n",
    re.MULTILINE,
)


def wire_dropdown(html: str) -> str:
    if "data-change-password" not in html:
        html = re.sub(
            r'(<div class="dropdown-item)(?!\s+data-change-password)(">\s*<svg[^<]*</svg>\s*<span>修改密码</span></div>)',
            r'\1 data-change-password\2',
            html,
            count=1,
        )
    if "data-logout" not in html:
        html = re.sub(
            r'(<div class="dropdown-item danger)(?!\s+data-logout)(">\s*<svg[^<]*</svg>\s*<span>退出登录</span></div>)',
            r'\1 data-logout\2',
            html,
            count=1,
        )
    return html


def add_api_head(html: str) -> str:
    if "CHOIR_API_BASE" in html:
        return html
    return html.replace("</head>", API_HEAD + "</head>", 1)


def add_shell(html: str) -> str:
    if "app-shell.js" in html:
        return html
    html = USER_DROPDOWN_BLOCK.sub("\n", html)
    return html.replace("</body>", SHELL_SCRIPTS + "\n</body>", 1)


def update_system_page(text: str) -> str:
    text = wire_dropdown(text)
    start = text.find('<p class="page-subtitle">账号管理')
    end = text.find("  </main>", start)
    if start == -1 or end == -1:
        print("WARN: system page markers not found", start, end)
        return text

    new_main = """<p class="page-subtitle">合唱团创建与管理（系统超管）</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" id="btn-refresh-choirs">刷新</button>
        <button type="button" class="btn btn-gold" id="btn-add-choir">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建合唱团
        </button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-value" id="stat-choirs">—</div>
        <div class="stat-label">合唱团总数</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" id="stat-active">—</div>
        <div class="stat-label">运营中</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">
          <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          合唱团列表
        </span>
      </div>
      <table class="user-table">
        <thead>
          <tr>
            <th>团名</th>
            <th>标识 slug</th>
            <th>人数上限</th>
            <th>状态</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="choirs-tbody">
          <tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">加载中…</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card" id="logs-placeholder">
      <div class="card-header">
        <span class="card-title">操作日志</span>
      </div>
      <div class="card-body" style="padding:1.25rem;color:var(--text-muted);font-size:0.9rem">
        操作日志将在后续阶段接入 API，当前仅展示合唱团管理。
      </div>
    </div>
"""
    new_main = new_main.replace("      </motion.div>\n      <div class=\"page-actions\">", "      </motion.div>\n      <div class=\"page-actions\">")
    new_main = new_main.replace("      </motion.div>", "      </div>", 1)
    text = text[:start] + new_main + text[end:]

    if "modal-create-choir" not in text:
        modal = """
<div id="toast" class="toast" hidden></div>
<div id="modal-create-choir" class="modal-overlay">
  <div class="modal-box">
    <h2>新建合唱团</h2>
    <form id="form-create-choir">
      <label for="new-choir-name">团名</label>
      <input id="new-choir-name" required maxlength="64" placeholder="例如：弦歌合唱团"/>
      <label for="new-choir-max">人数上限</label>
      <input id="new-choir-max" type="number" min="10" max="500" value="100"/>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-close-create>取消</button>
        <button type="submit" class="btn btn-gold">创建</button>
      </div>
    </form>
  </div>
</div>
"""
        text = text.replace("<footer class=\"footer\">", modal + "\n<footer class=\"footer\">", 1)

    text = re.sub(
        r"<script>\s*// Tab switching[\s\S]*?</script>\s*</body>",
        """<script src="/js/api.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/permissions.js"></script>
<script src="/js/ui-common.js"></script>
<script src="/js/app-shell.js"></script>
<script src="/js/system-admin-page.js"></script>
</body>""",
        text,
        count=1,
    )
    return text


def main():
    batch = [
        "极简中式-排练计划.html",
        "极简中式-献唱计划.html",
        "极简中式-作业提交.html",
        "极简中式-资料管理.html",
        "极简中式-录音管理.html",
        "极简中式-乐谱详情.html",
        "极简中式-团员前台.html",
        "极简中式-管理员后台.html",
    ]
    for name in batch:
        p = UI_DIR / name
        text = p.read_text(encoding="utf-8")
        text = add_api_head(text)
        text = wire_dropdown(text)
        text = add_shell(text)
        p.write_text(text, encoding="utf-8")
        print("updated", name)

    p = UI_DIR / "极简中式-系统管理.html"
    text = add_api_head(p.read_text(encoding="utf-8"))
    text = update_system_page(text)
    p.write_text(text, encoding="utf-8")
    print("updated 极简中式-系统管理.html")


if __name__ == "__main__":
    main()
