-- ============================================================
-- 003_integrations.sql
-- Tabela de integrações por tenant (iFood, Keeta, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       INT NOT NULL,
  platform        VARCHAR(50) NOT NULL,   -- 'ifood' | 'keeta'

  -- Credenciais (Step 2: cada tenant tem as suas)
  client_id       VARCHAR(255),
  client_secret   TEXT,
  merchant_id     VARCHAR(255),           -- ID da loja no iFood/Keeta

  -- Token cacheado (evita autenticar a cada request)
  access_token    TEXT,
  token_expires_at DATETIME NULL,

  -- Status
  is_active       TINYINT(1) DEFAULT 0,
  last_sync_at    DATETIME NULL,
  last_error      TEXT,

  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_tenant_platform (tenant_id, platform),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Tabela de pedidos vindos dos marketplaces
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       INT NOT NULL,
  platform        VARCHAR(50) NOT NULL,   -- 'ifood' | 'keeta'
  external_id     VARCHAR(255) NOT NULL,  -- ID do pedido no marketplace
  order_id        INT,                    -- FK para orders (após importação)

  raw_payload     JSON,                   -- payload original do marketplace
  status          VARCHAR(50) DEFAULT 'pending',
  acknowledged    TINYINT(1) DEFAULT 0,

  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_platform_external (platform, external_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);
