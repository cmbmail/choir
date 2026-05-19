from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.extensions import db


class Project(db.Model):
    __tablename__ = "projects"

    project_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    category_type = db.Column(db.String(32), nullable=False, default="其他")
    title = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="in_progress")
    progress_note = db.Column(db.Text)
    summary = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime, server_default=db.func.now(), onupdate=db.func.now()
    )
    completed_at = db.Column(db.DateTime, nullable=True)

    transactions = db.relationship(
        "ProjectTransaction",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectTransaction.txn_date.desc()",
    )
    todos = db.relationship(
        "ProjectTodo",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectTodo.sort_order.asc()",
    )

    def to_dict(self, include_detail: bool = False) -> Dict[str, Any]:
        income = Decimal("0")
        expense = Decimal("0")
        for t in self.transactions:
            amt = Decimal(str(t.amount or 0))
            if t.direction == "income":
                income += amt
            else:
                expense += amt
        todos_total = len(self.todos)
        todos_done = sum(1 for x in self.todos if x.is_done)
        row: Dict[str, Any] = {
            "project_id": self.project_id,
            "choir_id": self.choir_id,
            "year": self.year,
            "category_type": self.category_type,
            "title": self.title,
            "status": self.status,
            "progress_note": self.progress_note or "",
            "summary": self.summary or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "income_total": float(income),
            "expense_total": float(expense),
            "balance": float(income - expense),
            "todos_total": todos_total,
            "todos_done": todos_done,
        }
        if include_detail:
            row["transactions"] = [t.to_dict() for t in self.transactions]
            row["todos"] = [t.to_dict() for t in self.todos]
        return row


class ProjectTransaction(db.Model):
    __tablename__ = "project_transactions"

    transaction_id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(
        db.Integer, db.ForeignKey("projects.project_id"), nullable=False
    )
    txn_date = db.Column(db.Date, nullable=False)
    direction = db.Column(db.String(10), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    description = db.Column(db.String(500))
    created_by = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    project = db.relationship("Project", back_populates="transactions")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "transaction_id": self.transaction_id,
            "project_id": self.project_id,
            "txn_date": self.txn_date.isoformat() if self.txn_date else None,
            "direction": self.direction,
            "amount": float(self.amount or 0),
            "description": self.description or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ProjectTodo(db.Model):
    __tablename__ = "project_todos"

    todo_id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(
        db.Integer, db.ForeignKey("projects.project_id"), nullable=False
    )
    content = db.Column(db.String(500), nullable=False)
    is_done = db.Column(db.Boolean, nullable=False, default=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    completed_at = db.Column(db.DateTime, nullable=True)

    project = db.relationship("Project", back_populates="todos")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "todo_id": self.todo_id,
            "project_id": self.project_id,
            "content": self.content,
            "is_done": bool(self.is_done),
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
