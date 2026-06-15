-- ============================================================
-- 006_catalog_banner_about.sql
--
-- ✅ ADITIVO E SEGURO — apenas adiciona 3 colunas novas
-- (todas NULL por padrão). Não altera nem apaga nada existente.
--
-- banner_url : imagem de fundo do hero do catálogo (base64/URL)
-- about_text : texto da seção "Sobre" no catálogo público
-- address    : endereço exibido na seção "Contato"
-- ============================================================

ALTER TABLE store_themes
  ADD COLUMN banner_url MEDIUMTEXT NULL,
  ADD COLUMN about_text TEXT NULL,
  ADD COLUMN address VARCHAR(255) NULL;
