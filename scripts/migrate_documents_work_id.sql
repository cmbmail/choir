-- Link score documents to works (run after migrate_phase2.sql)
USE choir_db;

ALTER TABLE documents
  ADD COLUMN work_id INT UNSIGNED NULL AFTER choir_id,
  ADD KEY idx_documents_work (work_id),
  ADD CONSTRAINT fk_documents_work
    FOREIGN KEY (work_id) REFERENCES works (work_id) ON DELETE SET NULL;
