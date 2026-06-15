-- ============================================================
-- 007_customer_auth.sql
--
-- ✅ ADITIVO E SEGURO — adiciona 1 coluna nullable em `clients`.
-- Não cria tabela nova: clientes que se cadastram no catálogo
-- SÃO a mesma linha que aparece em /clientes no admin.
--
-- password_hash: NULL = cliente sem login (cadastrado manualmente
-- pelo admin, ou pedido feito como convidado). Preenchido quando
-- o cliente cria conta no catálogo (e-mail + senha).
-- ============================================================

ALTER TABLE clients
  ADD COLUMN password_hash VARCHAR(255) NULL;
