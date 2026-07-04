-- ============================================================
-- 009_plan_and_safety.sql
--
-- Adiciona novos valores ao ENUM de planos e status do SaaS.
-- Backwards-compatible: mantém os valores antigos (free/pro/
-- enterprise) e acrescenta os novos (economico/standard/premium).
--
-- ⚠️ REMOVIDOS os ADD COLUMN IF NOT EXISTS das migrations 006/
-- 007/008 — sintaxe suportada apenas a partir do MySQL 8.0.3.
-- O Clever Cloud roda versão anterior. Como as migrations 006,
-- 007 e 008 já foram aplicadas com sucesso (colunas existem),
-- as verificações de segurança foram desnecessárias.
-- ============================================================

ALTER TABLE tenants
  MODIFY COLUMN plan
    ENUM('economico','standard','premium','free','pro','enterprise')
    NOT NULL DEFAULT 'economico';

ALTER TABLE tenants
  MODIFY COLUMN plan_status
    ENUM('active','trial','overdue','suspended','cancelled')
    NOT NULL DEFAULT 'active';
