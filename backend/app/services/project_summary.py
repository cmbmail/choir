"""项目完成时生成摘要文本。"""

from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Project


def build_project_summary(project: "Project") -> str:
    income = Decimal("0")
    expense = Decimal("0")
    for t in project.transactions:
        amt = Decimal(str(t.amount or 0))
        if t.direction == "income":
            income += amt
        else:
            expense += amt
    balance = income - expense
    todos_total = len(project.todos)
    todos_done = sum(1 for x in project.todos if x.is_done)

    lines = [
        f"【{project.year} · {project.category_type}】{project.title}",
        "",
        "一、项目概况",
        (project.progress_note or "（无进度记录）").strip(),
        "",
        "二、待办完成情况",
        f"共 {todos_total} 项，已完成 {todos_done} 项。",
    ]
    pending = [x.content for x in project.todos if not x.is_done]
    if pending:
        lines.append("未完成：" + "；".join(pending[:8]))
    done_items = [x.content for x in project.todos if x.is_done]
    if done_items:
        lines.append("已完成：" + "；".join(done_items[:8]))

    lines.extend(
        [
            "",
            "三、流水账汇总",
            f"收入合计：¥{income:.2f}",
            f"支出合计：¥{expense:.2f}",
            f"结余：¥{balance:.2f}",
        ]
    )
    if project.transactions:
        lines.append("")
        lines.append("明细（最近 10 笔）：")
        for t in list(project.transactions)[:10]:
            sign = "收入" if t.direction == "income" else "支出"
            desc = (t.description or "").strip()
            lines.append(
                f"- {t.txn_date} {sign} ¥{Decimal(str(t.amount or 0)):.2f}"
                + (f"（{desc}）" if desc else "")
            )
    return "\n".join(lines).strip()
