-- ============================================================
-- 002_seed_categories.sql
--
-- ✅ ADITIVO E SEGURO — não apaga nem altera produtos existentes.
-- Apenas:
--   1. Insere as 9 categorias para CADA tenant que ainda não as tem
--   2. Atualiza produtos SEM categoria (category_id NULL) para
--      apontarem para "Bolos Tradicionais" do respectivo tenant
--
-- Idempotente: pode rodar quantas vezes quiser (usa NOT EXISTS).
-- ============================================================

-- 1) Insere as categorias padrão para cada tenant existente
INSERT INTO categories (tenant_id, name, description)
SELECT t.id, c.name, c.description
FROM tenants t
CROSS JOIN (
  SELECT 'Bolos Tradicionais'     AS name, 'Bolos no formato clássico, sem cobertura especial' AS description UNION ALL
  SELECT 'Bolos com Cobertura',   'Bolos decorados com coberturas (chantilly, ganache, pasta americana, etc.)' UNION ALL
  SELECT 'Bolos para Festas',     'Bolos temáticos e personalizados para festas e eventos' UNION ALL
  SELECT 'Docinhos e Brigadeiros','Brigadeiros, docinhos e finger food para festas' UNION ALL
  SELECT 'Geleias e Compotas',    'Geleias, compotas e doces em conserva' UNION ALL
  SELECT 'Tortas Doces',          'Tortas doces de diversos sabores' UNION ALL
  SELECT 'Biscoitos e Cookies',   'Biscoitos amanteigados, cookies e similares' UNION ALL
  SELECT 'Bebidas',               'Sucos, refrigerantes e outras bebidas para acompanhar' UNION ALL
  SELECT 'Kits',                  'Kits e combos de produtos prontos para festas'
) AS c
WHERE NOT EXISTS (
  SELECT 1 FROM categories existing
  WHERE existing.tenant_id = t.id AND existing.name = c.name
);

-- 2) Produtos que JÁ existiam e ainda não têm categoria
--    recebem "Bolos Tradicionais" automaticamente (não muda mais nada).
UPDATE products p
JOIN categories cat
  ON cat.tenant_id = p.tenant_id AND cat.name = 'Bolos Tradicionais'
SET p.category_id = cat.id
WHERE p.category_id IS NULL;
