"""Work detail asset doc_type constants and labels."""

from __future__ import annotations

from typing import Dict, FrozenSet

# Primary types for work detail uploads
WORK_ASSET_SCORE = "score"
WORK_ASSET_ACCOMPANIMENT = "accompaniment"
WORK_ASSET_PERFORMANCE_VIDEO = "performance_video"
WORK_ASSET_NOTES = "notes"

WORK_ASSET_TYPES: FrozenSet[str] = frozenset(
    {
        WORK_ASSET_SCORE,
        WORK_ASSET_ACCOMPANIMENT,
        WORK_ASSET_PERFORMANCE_VIDEO,
        WORK_ASSET_NOTES,
    }
)

WORK_ASSET_LABELS: Dict[str, str] = {
    WORK_ASSET_SCORE: "歌谱",
    WORK_ASSET_ACCOMPANIMENT: "伴奏",
    WORK_ASSET_PERFORMANCE_VIDEO: "献唱视频",
    WORK_ASSET_NOTES: "说明",
}

# Legacy doc_type values → section for listing on work detail
LEGACY_TYPE_TO_SECTION: Dict[str, str] = {
    "audio": WORK_ASSET_ACCOMPANIMENT,
    "video": WORK_ASSET_PERFORMANCE_VIDEO,
    "perf": WORK_ASSET_NOTES,
    "rehearsal": WORK_ASSET_NOTES,
    "other": WORK_ASSET_NOTES,
}


def section_for_doc_type(doc_type: str) -> str:
    t = (doc_type or "").strip().lower()
    if t in WORK_ASSET_TYPES:
        return t
    return LEGACY_TYPE_TO_SECTION.get(t, WORK_ASSET_NOTES)


def label_for_doc_type(doc_type: str) -> str:
    t = (doc_type or "").strip().lower()
    if t in WORK_ASSET_LABELS:
        return WORK_ASSET_LABELS[t]
    return WORK_ASSET_LABELS.get(section_for_doc_type(t), doc_type or "资料")
