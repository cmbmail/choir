-- 项目管理：流水账、编年纪类型、进度、待办、完成摘要

CREATE TABLE IF NOT EXISTS projects (
  project_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  choir_id INT UNSIGNED NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  category_type VARCHAR(32) NOT NULL DEFAULT '其他',
  title VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  progress_note TEXT NULL,
  summary TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (project_id),
  KEY idx_projects_choir_year (choir_id, year),
  KEY idx_projects_choir_type (choir_id, category_type),
  KEY idx_projects_status (status),
  CONSTRAINT fk_projects_choir FOREIGN KEY (choir_id) REFERENCES choirs (choir_id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_transactions (
  transaction_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  txn_date DATE NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description VARCHAR(500) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (transaction_id),
  KEY idx_ptxn_project (project_id),
  KEY idx_ptxn_date (txn_date),
  CONSTRAINT fk_ptxn_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
  CONSTRAINT fk_ptxn_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_todos (
  todo_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  content VARCHAR(500) NOT NULL,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (todo_id),
  KEY idx_ptodo_project (project_id),
  CONSTRAINT fk_ptodo_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
