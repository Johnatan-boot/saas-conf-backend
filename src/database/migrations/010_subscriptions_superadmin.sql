-- ============================================================
-- 010_subscriptions_superadmin.sql
--
-- 1. Atualiza schema de tenants para suportar limites por plano
-- 2. Cria tabela de assinaturas (subscriptions) com ciclos de
--    cobrança mensais / 12x / 24x / 36x
-- 3. Adiciona role 'super_admin' à tabela users
-- 4. FIX: Atualiza plano da Confeitaria do Jony para 'premium'
-- 5. Garante que o super admin padrão existe (usuario do sistema)
-- ============================================================

-- Atualiza role dos usuários para incluir super_admin
ALTER TABLE users
  MODIFY COLUMN role
    ENUM('super_admin','admin','manager','staff')
    NOT NULL DEFAULT 'staff';

-- Tabela de assinaturas
CREATE TABLE IF NOT EXISTS subscriptions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       INT NOT NULL,
  plan            ENUM('economico','standard','premium') NOT NULL DEFAULT 'economico',
  billing_cycle   ENUM('mensal','12x','24x','36x') NOT NULL DEFAULT 'mensal',
  price_per_month DECIMAL(10,2) NOT NULL,
  total_months    INT NOT NULL DEFAULT 1,
  started_at      DATE NOT NULL,
  expires_at      DATE NULL,
  status          ENUM('trial','active','overdue','cancelled','suspended') NOT NULL DEFAULT 'active',
  notes           TEXT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_status    (status),
  INDEX idx_plan      (plan)
);

-- FIX: Plano da Confeitaria do Jony → premium
UPDATE tenants
SET plan = 'premium', plan_status = 'active',
    max_users = 9999, max_products = 9999, max_orders_month = 9999
WHERE slug = 'confeitaria-do-jony';

-- Cria assinatura premium para Confeitaria do Jony (se ainda não tiver)
INSERT INTO subscriptions (tenant_id, plan, billing_cycle, price_per_month, total_months, started_at, status)
SELECT t.id, 'premium', 'mensal', 199.90, 1, CURDATE(), 'active'
FROM tenants t
WHERE t.slug = 'confeitaria-do-jony'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id);

-- Super admin padrão (tenant_id = 1 = demo system tenant)
-- Senha padrão: superadmin123 (deve ser trocada em produção)
-- hash: $2b$12$placeholder (será ignorado se já existir)
INSERT IGNORE INTO users (tenant_id, name, email, role, created_at)
SELECT 1, 'Super Admin', 'superadmin@sweetflow.com.br', 'super_admin', NOW()
FROM tenants WHERE id = 1
LIMIT 1;
