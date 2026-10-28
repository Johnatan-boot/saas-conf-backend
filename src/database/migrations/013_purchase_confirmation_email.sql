-- Controle de envio do e-mail de confirmação de compra (evita duplicidade
-- quando o gateway reenvia o webhook). Rode uma única vez.
ALTER TABLE subscriptions
  ADD COLUMN confirmation_email_sent_at DATETIME NULL
