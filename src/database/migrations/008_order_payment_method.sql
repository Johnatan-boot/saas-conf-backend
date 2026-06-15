-- ============================================================
-- 008_order_payment_method.sql
--
-- ✅ ADITIVO E SEGURO — 1 coluna nullable em `orders`.
--
-- Guarda a forma de pagamento ESCOLHIDA pelo cliente no catálogo
-- (pix, dinheiro, cartão na entrega, stripe, mercadopago, pagarme).
-- Sem isso, o admin não sabia COMO o cliente pretendia pagar.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN payment_method VARCHAR(30) NULL;
