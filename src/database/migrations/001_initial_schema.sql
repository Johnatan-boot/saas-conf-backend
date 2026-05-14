-- =============================================
-- SaaS Confeitaria — Schema Completo v2
-- Suporte a multitenancy com tenant_id em todas as tabelas
-- =============================================

CREATE TABLE IF NOT EXISTS tenants (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  email       VARCHAR(255) NOT NULL,
  plan        ENUM('free','pro','enterprise') DEFAULT 'free',
  plan_status ENUM('active','suspended','cancelled') DEFAULT 'active',
  stripe_customer_id   VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  max_users   INT DEFAULT 3,
  max_products INT DEFAULT 50,
  max_orders_month INT DEFAULT 100,
  logo_url    VARCHAR(500),
  phone       VARCHAR(50),
  address     VARCHAR(500),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin','manager','staff') DEFAULT 'staff',
  is_active   BOOLEAN DEFAULT TRUE,
  refresh_token VARCHAR(500),
  last_login  TIMESTAMP NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL,
  UNIQUE KEY unique_email_tenant (email, tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_email (email)
);

CREATE TABLE IF NOT EXISTS clients (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(50),
  birthday    DATE,
  address     VARCHAR(500),
  notes       TEXT,
  total_orders INT DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0.00,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  INDEX idx_tenant_id (tenant_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  category_id INT,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL,
  cost_price  DECIMAL(10,2),
  unit        VARCHAR(50) DEFAULT 'unidade',
  stock       INT DEFAULT 0,
  min_stock   INT DEFAULT 0,
  image_url   VARCHAR(500),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_tenant_id (tenant_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id     INT NOT NULL,
  client_id     INT,
  user_id       INT,
  code          VARCHAR(50),
  status        ENUM('pending','confirmed','in_production','ready','delivered','cancelled') DEFAULT 'pending',
  delivery_date DATETIME,
  delivery_type ENUM('pickup','delivery') DEFAULT 'pickup',
  delivery_address VARCHAR(500),
  subtotal      DECIMAL(10,2) DEFAULT 0,
  discount      DECIMAL(10,2) DEFAULT 0,
  total         DECIMAL(10,2) NOT NULL,
  notes         TEXT,
  internal_notes TEXT,
  paid_at       TIMESTAMP NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_status (status),
  INDEX idx_delivery_date (delivery_date)
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  product_id  INT,
  product_name VARCHAR(255) NOT NULL,
  quantity    INT DEFAULT 1,
  unit_price  DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  notes       TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       INT NOT NULL,
  order_id        INT NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  method          ENUM('cash','pix','credit_card','debit_card','transfer') DEFAULT 'cash',
  status          ENUM('pending','paid','refunded','failed') DEFAULT 'pending',
  stripe_payment_id VARCHAR(255),
  paid_at         TIMESTAMP NULL,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX idx_tenant_id (tenant_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  user_id     INT,
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(100),
  entity_id   INT,
  old_data    JSON,
  new_data    JSON,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_action (action)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  user_id     INT,
  type        VARCHAR(100) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  message     TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant_user (tenant_id, user_id)
);
