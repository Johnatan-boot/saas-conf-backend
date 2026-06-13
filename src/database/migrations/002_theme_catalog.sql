-- ============================================================
-- 002_theme_catalog.sql
-- IMPORTANTE: logo_url é MEDIUMTEXT para suportar base64
-- ============================================================

CREATE TABLE IF NOT EXISTS store_themes (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT NOT NULL UNIQUE,
  primary_color    VARCHAR(20)   NOT NULL DEFAULT '#6F4F37',
  secondary_color  VARCHAR(20)   NOT NULL DEFAULT '#c4621d',
  background_color VARCHAR(20)   NOT NULL DEFAULT '#fffdf9',
  text_color       VARCHAR(20)   NOT NULL DEFAULT '#261c12',
  card_color       VARCHAR(20)   NOT NULL DEFAULT '#ffffff',
  logo_url         MEDIUMTEXT,          -- base64 pode ser grande: use MEDIUMTEXT
  store_name       VARCHAR(100),
  tagline          VARCHAR(200),
  slug             VARCHAR(80)   UNIQUE,
  instagram        TEXT,
  facebook         TEXT,
  whatsapp         VARCHAR(20),
  youtube          TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_slug (slug)
);

-- Catálogo: pedidos públicos
CREATE TABLE IF NOT EXISTS catalog_orders (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       INT NOT NULL,
  code            VARCHAR(50) NOT NULL,
  customer_name   VARCHAR(100) NOT NULL,
  customer_phone  VARCHAR(30)  NOT NULL,
  customer_email  VARCHAR(100),
  customer_document VARCHAR(20),
  customer_address TEXT,
  notes           TEXT,
  total           DECIMAL(10,2) NOT NULL,
  payment_method  VARCHAR(30)   NOT NULL DEFAULT 'pix',
  status          VARCHAR(30)   NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant_status (tenant_id, status)
);

CREATE TABLE IF NOT EXISTS catalog_order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  product_id  INT NOT NULL,
  product_name VARCHAR(200),
  quantity    INT NOT NULL CHECK (quantity > 0),
  unit_price  DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES catalog_orders(id) ON DELETE CASCADE
);
