-- Multi-choir work sharing (run after migrate_phase2.sql and migrate_documents_work_id.sql)
USE choir_db;

CREATE TABLE IF NOT EXISTS work_shares (
  work_id           INT UNSIGNED NOT NULL,
  choir_id          INT UNSIGNED NOT NULL,
  shared_by         INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (work_id, choir_id),
  KEY idx_work_shares_choir (choir_id),
  CONSTRAINT fk_work_shares_work
    FOREIGN KEY (work_id) REFERENCES works (work_id) ON DELETE CASCADE,
  CONSTRAINT fk_work_shares_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_work_shares_user
    FOREIGN KEY (shared_by) REFERENCES users (user_id) ON DELETE SET NULL
);
