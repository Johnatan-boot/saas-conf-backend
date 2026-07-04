-- ============================================================
-- 009_plan_and_safety.sql
--
-- 1. Adiciona novos valores ao ENUM de planos do SaaS
--    (economico / standard / premium) sem remover os antigos
--    (free / pro / enterprise) — backwards-compatible.
--
-- 2. Garante que store_themes tem as colunas de banner/sobre/
--    endereço (006_catalog_banner_about) — caso a migration
--    anterior tenha falhado silenciosamente na instância MySQL.
--
-- 3. Garante que clients tem password_hash (007_customer_auth).
--
-- 4. Garante que orders tem payment_method (008_order_payment).
--
-- Todas as adições usam ADD COLUMN IF NOT EXISTS (MySQL 8.0+)
-- para serem idempotentes sem erros de "column already exists".
-- ============================================================

-- Planos do SaaS
ALTER TABLE tenants
  MODIFY COLUMN plan
    ENUM('economico','standard','premium','free','pro','enterprise')
    NOT NULL DEFAULT 'economico';

ALTER TABLE tenants
  MODIFY COLUMN plan_status
    ENUM('active','trial','overdue','suspended','cancelled')
    NOT NULL DEFAULT 'active';

-- Safety: re-garante store_themes (006)
ALTER TABLE store_themes
  ADD COLUMN IF NOT EXISTS banner_url  MEDIUMTEXT NULL,
  ADD COLUMN IF NOT EXISTS about_text  TEXT NULL,
  ADD COLUMN IF NOT EXISTS address     VARCHAR(255) NULL;

-- Safety: re-garante clients (007)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;

-- Safety: re-garante orders (008)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NULL;
