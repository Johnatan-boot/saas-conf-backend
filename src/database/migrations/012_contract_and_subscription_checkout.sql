-- ============================================================
-- 012_contract_and_subscription_checkout.sql
--
-- Suporte ao fluxo: cliente escolhe o plano no cadastro, aceita
-- o contrato de prestação de serviços do SaaS e finaliza a
-- assinatura via gateway de pagamento (Pagar.me / Mercado Pago /
-- Stripe). Antes, a escolha/atribuição de plano era feita
-- manualmente pelo super admin em "Nova Assinatura".
-- ============================================================

-- Registro de aceite do contrato pelo tenant (auditoria/LGPD)
CREATE TABLE IF NOT EXISTS contract_acceptances (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id         INT NOT NULL,
  plan              ENUM('economico','standard','premium') NOT NULL,
  contract_version  VARCHAR(20) NOT NULL,
  accepted_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address        VARCHAR(45),
  user_agent        VARCHAR(500),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant_id (tenant_id)
);

-- Marca no próprio tenant qual foi o último contrato aceito
-- (⚠️ igual à migration 009: sem "IF NOT EXISTS" em ADD COLUMN,
-- pois não é suportado nas versões de MySQL usadas no Clever Cloud/Render.
-- Rode esta migration uma única vez.)
ALTER TABLE tenants
  ADD COLUMN contract_accepted_at TIMESTAMP NULL,
  ADD COLUMN contract_version VARCHAR(20) NULL;

-- Rastreia o gateway/pagamento vinculado a cada assinatura
ALTER TABLE subscriptions
  ADD COLUMN gateway VARCHAR(20) NULL,
  ADD COLUMN external_reference VARCHAR(255) NULL,
  ADD COLUMN payment_status ENUM('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
  ADD INDEX idx_subscriptions_external_reference (external_reference);

-- Novo status de tenant para "aguardando confirmação de pagamento"
-- da primeira assinatura, criada durante o cadastro.
ALTER TABLE tenants
  MODIFY COLUMN plan_status
    ENUM('active','trial','pending_payment','overdue','suspended','cancelled')
    NOT NULL DEFAULT 'trial';
