-- 已完成项目：项目资料（影视 / 图 / 文）

CREATE TABLE IF NOT EXISTS project_assets (
  asset_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  media_kind VARCHAR(16) NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_name VARCHAR(255) NULL,
  mime_type VARCHAR(128) NULL,
  file_size BIGINT UNSIGNED NULL,
  cde_file_id VARCHAR(128) NULL,
  video_url VARCHAR(500) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_id),
  KEY idx_passet_project (project_id),
  KEY idx_passet_kind (media_kind),
  CONSTRAINT fk_passet_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
  CONSTRAINT fk_passet_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
