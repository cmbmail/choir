-- Extend documents.doc_type for work detail asset types (accompaniment, performance_video, notes).
-- Safe on MySQL 8: widen ENUM to VARCHAR to match application model.

ALTER TABLE documents
  MODIFY COLUMN doc_type VARCHAR(32) NOT NULL DEFAULT 'other';
