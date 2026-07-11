-- ============================================================
-- 011_access_logs.sql
-- Tabela de histórico de acessos para rastreio no Super Admin
-- ============================================================

CREATE TABLE IF NOT EXISTS access_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NULL,
  user_id     INT NULL,
  email       VARCHAR(255) NULL,
  action      ENUM('login','logout','login_failed','password_reset','plan_change') DEFAULT 'login',
  ip_address  VARCHAR(60) NULL,
  user_agent  TEXT NULL,
  details     TEXT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant    (tenant_id),
  INDEX idx_user      (user_id),
  INDEX idx_action    (action),
  INDEX idx_created   (created_at)
);
