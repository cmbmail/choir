-- 弦歌合唱团管理系统 — MySQL 8.0 DDL (v2.1.5)
-- 使用: mysql -u choir -p choir_db < scripts/schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS choir_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE choir_db;

DROP TABLE IF EXISTS recordings;
DROP TABLE IF EXISTS work_shares;
DROP TABLE IF EXISTS works;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS operation_logs;
DROP TABLE IF EXISTS invitation_codes;
DROP TABLE IF EXISTS captcha_challenges;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS choir_roles;
DROP TABLE IF EXISTS choirs;
DROP TABLE IF EXISTS system_config;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- choirs
-- ---------------------------------------------------------------------------
CREATE TABLE choirs (
  choir_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(100) NOT NULL,
  slug            VARCHAR(50)  NOT NULL,
  max_members     INT UNSIGNED NOT NULL DEFAULT 100,
  status          ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  cde_root_folder_id VARCHAR(200) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (choir_id),
  UNIQUE KEY uk_choirs_slug (slug),
  KEY idx_choirs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- choir_roles
-- ---------------------------------------------------------------------------
CREATE TABLE choir_roles (
  role_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id        INT UNSIGNED NOT NULL,
  role_code       VARCHAR(32)  NOT NULL,
  name            VARCHAR(64)  NOT NULL,
  permissions     JSON         NOT NULL,
  is_builtin      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id),
  UNIQUE KEY uk_choir_roles_code (choir_id, role_code),
  KEY idx_choir_roles_choir (choir_id),
  CONSTRAINT fk_choir_roles_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- users (成员; username = 手机号)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  user_id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id              INT UNSIGNED NULL,
  role_id               INT UNSIGNED NULL,
  username              VARCHAR(32)  NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  name                  VARCHAR(64)  NOT NULL,
  email                 VARCHAR(255) NULL,
  voice_part            TINYINT UNSIGNED NULL COMMENT '1-8: S1..B2',
  status                ENUM('active', 'inactive', 'leave') NOT NULL DEFAULT 'active',
  system_super_admin    TINYINT(1)   NOT NULL DEFAULT 0,
  failed_login_count    INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME NULL,
  password_changed_at   TIMESTAMP NULL,
  token_version         INT UNSIGNED NOT NULL DEFAULT 0,
  last_login            TIMESTAMP NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_users_choir_username (choir_id, username),
  KEY idx_users_choir (choir_id),
  KEY idx_users_role (role_id),
  KEY idx_users_status (status),
  CONSTRAINT fk_users_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id) REFERENCES choir_roles (role_id) ON DELETE RESTRICT,
  CONSTRAINT chk_users_system_admin
    CHECK (
      (system_super_admin = 0 AND choir_id IS NOT NULL AND role_id IS NOT NULL)
      OR (system_super_admin = 1 AND choir_id IS NULL AND role_id IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- invitation_codes
-- ---------------------------------------------------------------------------
CREATE TABLE invitation_codes (
  invite_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id        INT UNSIGNED NOT NULL,
  code_hash       VARCHAR(64)  NOT NULL,
  voice_part      TINYINT UNSIGNED NULL,
  max_uses        INT UNSIGNED NOT NULL DEFAULT 1,
  use_count       INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at      DATETIME NOT NULL,
  created_by      INT UNSIGNED NULL,
  revoked_at      DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invite_id),
  UNIQUE KEY uk_invitation_code_hash (code_hash),
  KEY idx_invitation_choir (choir_id),
  KEY idx_invitation_expires (expires_at),
  CONSTRAINT fk_invitation_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_invitation_creator
    FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- captcha_challenges
-- ---------------------------------------------------------------------------
CREATE TABLE captcha_challenges (
  captcha_id      CHAR(36)     NOT NULL,
  answer_hash     VARCHAR(64)  NOT NULL,
  expires_at      DATETIME NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (captcha_id),
  KEY idx_captcha_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- operation_logs
-- ---------------------------------------------------------------------------
CREATE TABLE operation_logs (
  log_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id        INT UNSIGNED NULL,
  user_id         INT UNSIGNED NULL,
  action          VARCHAR(64)  NOT NULL,
  resource_type   VARCHAR(32)  NULL,
  resource_id     VARCHAR(64)  NULL,
  detail          JSON         NULL,
  ip_address      VARCHAR(45)  NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_logs_choir (choir_id),
  KEY idx_logs_user (user_id),
  KEY idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- system_config (slug 序号等)
-- ---------------------------------------------------------------------------
CREATE TABLE system_config (
  config_key      VARCHAR(64)  NOT NULL,
  config_value    VARCHAR(255) NOT NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO system_config (config_key, config_value) VALUES ('choir_slug_seq', '0');

-- ---------------------------------------------------------------------------
-- works & recordings (phase 2) — before documents (FK work_id)
-- ---------------------------------------------------------------------------
CREATE TABLE works (
  work_id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id          INT UNSIGNED NOT NULL,
  name              VARCHAR(100) NOT NULL,
  composer          VARCHAR(50) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  deleted_by        INT UNSIGNED NULL,
  PRIMARY KEY (work_id),
  KEY idx_works_choir (choir_id),
  KEY idx_works_deleted (deleted_at),
  CONSTRAINT fk_works_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_works_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recordings (
  recording_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id          INT UNSIGNED NOT NULL,
  work_id           INT UNSIGNED NOT NULL,
  name              VARCHAR(100) NOT NULL,
  cde_file_id       VARCHAR(128) NULL,
  file_name         VARCHAR(255) NULL,
  mime_type         VARCHAR(128) NULL,
  file_size         BIGINT UNSIGNED NULL,
  parts             JSON NULL,
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

CREATE TABLE work_shares (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- documents (phase 2)
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
  document_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id          INT UNSIGNED NOT NULL,
  work_id           INT UNSIGNED NULL,
  title             VARCHAR(200) NOT NULL,
  doc_type          VARCHAR(32) NOT NULL DEFAULT 'other'
                    NOT NULL DEFAULT 'other',
  category          VARCHAR(64) NULL,
  style             VARCHAR(64) NULL,
  collection_name   VARCHAR(64) NULL,
  description       TEXT NULL,
  musical_key       VARCHAR(32) NULL,
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
  KEY idx_documents_work (work_id),
  KEY idx_documents_type (doc_type),
  KEY idx_documents_created (created_at),
  CONSTRAINT fk_documents_choir
    FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_work
    FOREIGN KEY (work_id) REFERENCES works (work_id) ON DELETE SET NULL,
  CONSTRAINT fk_documents_uploader
    FOREIGN KEY (uploaded_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
