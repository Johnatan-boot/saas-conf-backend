-- ============================================================
-- 003_widen_product_image_url.sql
--
-- ✅ ADITIVO E SEGURO — apenas amplia o TIPO da coluna.
-- VARCHAR(500) -> MEDIUMTEXT
--
-- Por quê: a nova opção de "adicionar imagem" no cadastro de
-- produtos converte a foto em base64 (mesmo esquema já usado
-- na logo da loja). Base64 de uma foto facilmente passa de 500
-- caracteres, então o VARCHAR(500) original truncaria a imagem.
--
-- MEDIUMTEXT suporta até ~16MB — mais que suficiente.
-- Produtos que já têm uma URL normal em image_url continuam
-- funcionando exatamente igual (string cabe tranquilamente).
-- ============================================================

ALTER TABLE products MODIFY COLUMN image_url MEDIUMTEXT;
