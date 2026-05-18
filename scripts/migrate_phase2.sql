-- Phase 2: documents, works, recordings (run on existing choir_db)
-- mysql -u choir -p choir_db < scripts/migrate_phase2.sql

USE choir_db;

CREATE TABLE IF NOT EXISTS documents (
  document_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id          INT UNSIGNED NOT NULL,
  title             VARCHAR(200) NOT NULL,
  doc_type          VARCHAR(32) NOT NULL DEFAULT 'other'
                    NOT NULL DEFAULT 'other',
  category          VARCHAR(64) NULL,
  style             VARCHAR(64) NULL,
  collection_name   VARCHAR(64) NULL,
  cde_file_id       VARCHAR(128) NULL,
  file_name         VARCHAR(255) NULL,
  mime_type         VARCHAR(128) NULL,
  file_size         BIGINT UNSIGNED NULL,
  voice_parts       JSON NULL,
  video_url         VARCHAR(500) NULL,
  uploaded_by       INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id),
  KEY idx_documents_choir (choir_id),
  KEY idx_documents_type (doc_type),
  KEY idx_documents_created (created_at),
  CONSTRAINT fk_documents_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_uploader
    FOREIGN KEY (uploaded_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS works (
  work_id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id          INT UNSIGNED NOT NULL,
  name              VARCHAR(100) NOT NULL,
  composer          VARCHAR(50) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (work_id),
  KEY idx_works_choir (choir_id),
  CONSTRAINT fk_works_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recordings (
  recording_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id          INT UNSIGNED NOT NULL,
  work_id           INT UNSIGNED NOT NULL,
  name              VARCHAR(100) NOT NULL,
  cde_file_id       VARCHAR(128) NULL,
  file_name         VARCHAR(255) NULL,
  mime_type         VARCHAR(128) NULL,
  file_size         BIGINT UNSIGNED NULL,
  parts             JSON NULL COMMENT 'voice part numbers 1-8',
  uploaded_by       INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recording_id),
  KEY idx_recordings_work (work_id),
  KEY idx_recordings_choir (choir_id),
  CONSTRAINT fk_recordings_work
    FOREIGN KEY (work_id) REFERENCES works (work_id) ON DELETE CASCADE,
  CONSTRAINT fk_recordings_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_recordings_uploader
    FOREIGN KEY (uploaded_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
