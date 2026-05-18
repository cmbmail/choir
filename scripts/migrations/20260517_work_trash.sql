-- Soft-delete works (recycle bin); purge files after 7 days via cron:
--   cd /opt/choir/backend && source .venv/bin/activate && flask purge-work-trash

ALTER TABLE works
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER created_at,
  ADD COLUMN deleted_by INT UNSIGNED NULL DEFAULT NULL AFTER deleted_at,
  ADD KEY idx_works_deleted (deleted_at),
  ADD CONSTRAINT fk_works_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES users (user_id) ON DELETE SET NULL;
