import { db } from '../../database/connection'

export async function getKPIs(tenantId: number) {
  const [[revenue]]: any = await db.execute(
    `SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(total),0) as month
     FROM orders WHERE tenant_id=? AND status='delivered'
     AND MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())`,
    [tenantId]
  )
  const [[orders]]: any = await db.execute(
    `SELECT COUNT(*) as total,
      SUM(status='pending') as pending,
      SUM(status='in_production') as in_production,
      SUM(status='delivered') as delivered,
      SUM(status='cancelled') as cancelled
     FROM orders WHERE tenant_id=? AND MONTH(created_at)=MONTH(NOW())`,
    [tenantId]
  )
  const [[clients]]: any = await db.execute(
    'SELECT COUNT(*) as total FROM clients WHERE tenant_id=? AND deleted_at IS NULL',
    [tenantId]
  )
  const [[products]]: any = await db.execute(
    'SELECT COUNT(*) as total, SUM(stock<=min_stock AND is_active=1) as low_stock FROM products WHERE tenant_id=? AND deleted_at IS NULL',
    [tenantId]
  )
  return { revenue, orders, clients, products }
}

export async function getRevenueByDay(tenantId: number, days = 30) {
  const [rows]: any = await db.execute(
    `SELECT DATE(created_at) as date, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
     FROM orders WHERE tenant_id=? AND status='delivered'
     AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE(created_at) ORDER BY date ASC`,
    [tenantId, days]
  )
  return rows
}

export async function getTopProducts(tenantId: number, limit = 5) {
  // ⚠️ mysql2 .execute() (prepared statements) NÃO aceita LIMIT como
  // parâmetro bound (?) — trava com "Incorrect arguments to mysqld_stmt_execute"
  // (erro 500). Valor validado como inteiro seguro e embutido inline.
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 5)), 100)
  const [rows]: any = await db.execute(
    `SELECT oi.product_name,
            SUM(oi.quantity) as total_qty,
            SUM(oi.total_price) as total_revenue
     FROM order_items oi JOIN orders o ON o.id=oi.order_id
     WHERE o.tenant_id=? AND o.status='delivered'
       AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY oi.product_name
     ORDER BY total_revenue DESC LIMIT ${safeLimit}`,
    [tenantId]
  )
  return rows
}

export async function getOrdersByStatus(tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT status, COUNT(*) as count FROM orders WHERE tenant_id=? GROUP BY status',
    [tenantId]
  )
  return rows
}

export async function getUpcomingDeliveries(tenantId: number) {
  const [rows]: any = await db.execute(
    `SELECT o.*, c.name as client_name FROM orders o
     LEFT JOIN clients c ON c.id=o.client_id
     WHERE o.tenant_id=? AND o.delivery_date >= NOW()
       AND o.status NOT IN ('delivered','cancelled')
     ORDER BY o.delivery_date ASC LIMIT 10`,
    [tenantId]
  )
  return rows
}

export async function getTopClients(tenantId: number, limit = 5) {
  // Mesmo motivo do getTopProducts — LIMIT não pode ser bound param.
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 5)), 100)
  const [rows]: any = await db.execute(
    `SELECT c.id, c.name, c.phone, c.total_orders, c.total_spent
     FROM clients c
     WHERE c.tenant_id=? AND c.deleted_at IS NULL
     ORDER BY c.total_spent DESC LIMIT ${safeLimit}`,
    [tenantId]
  )
  return rows
}

// ── Analytics: Lucro Real ─────────────────────────────────────────────────
export async function getProfitData(tenantId: number, days = 30) {
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(days) || 30)), 365)

  // Lucro diário: faturamento vs custo real dos produtos
  const [dailyData]: any = await db.execute(
    `SELECT
       DATE(o.created_at) as date,
       SUM(o.total) as revenue,
       COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) as cost
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.tenant_id = ? AND o.status = 'delivered'
       AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${safeLimit} DAY)
     GROUP BY DATE(o.created_at)
     ORDER BY date ASC`,
    [tenantId]
  )

  // Margem por produto
  const [productMargin]: any = await db.execute(
    `SELECT
       oi.product_name as name,
       SUM(oi.quantity) as units_sold,
       SUM(oi.total_price) as revenue,
       COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) as cost
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.tenant_id = ? AND o.status = 'delivered'
       AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${safeLimit} DAY)
     GROUP BY oi.product_id, oi.product_name
     HAVING revenue > 0
     ORDER BY revenue DESC
     LIMIT 10`,
    [tenantId]
  )

  return { dailyData, productMargin }
}

// ── Analytics: Menu Inteligente ───────────────────────────────────────────
export async function getSmartMenuData(tenantId: number) {
  // Produtos com estatísticas de venda
  const [products]: any = await db.execute(
    `SELECT
       p.id, p.name, p.price, p.cost_price, p.stock, p.image_url,
       COALESCE(cat.name,'Sem categoria') as category,
       COALESCE(SUM(oi.quantity), 0) as total_sold,
       COALESCE(SUM(oi.total_price), 0) as total_revenue
     FROM products p
     LEFT JOIN categories cat ON cat.id = p.category_id
     LEFT JOIN order_items oi ON oi.product_id = p.id
     LEFT JOIN orders o ON o.id = oi.order_id
       AND o.status IN ('delivered','confirmed','ready')
       AND o.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.is_active = 1
     GROUP BY p.id, p.name, p.price, p.cost_price, p.stock, p.image_url, cat.name
     ORDER BY total_sold DESC`,
    [tenantId]
  )

  // Score por dia da semana (0=Dom, 1=Seg, ..., 6=Sab)
  const [weekdayScores]: any = await db.execute(
    `SELECT
       oi.product_id,
       (DAYOFWEEK(o.created_at) + 5) % 7 as weekday,
       COUNT(oi.id) as cnt
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
       AND o.status IN ('delivered','confirmed','ready')
       AND o.tenant_id = ?
       AND o.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     GROUP BY oi.product_id, weekday`,
    [tenantId]
  )

  // Produtos parados (em estoque, sem venda nos últimos 14 dias)
  const [slowMovers]: any = await db.execute(
    `SELECT
       p.id, p.name, p.stock,
       COALESCE(DATEDIFF(NOW(), MAX(o.created_at)), 999) as days_since_last_sale
     FROM products p
     LEFT JOIN order_items oi ON oi.product_id = p.id
     LEFT JOIN orders o ON o.id = oi.order_id
       AND o.status IN ('delivered','confirmed','ready')
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL
       AND p.is_active = 1 AND p.stock > 0
     GROUP BY p.id, p.name, p.stock
     HAVING days_since_last_sale > 14
     ORDER BY days_since_last_sale DESC
     LIMIT 5`,
    [tenantId]
  )

  return { products, weekdayScores, slowMovers }
}

// ── Analytics: Recorrência e Fidelidade ──────────────────────────────────
export async function getRecurrenceData(tenantId: number) {
  // Clientes com aniversário nos próximos 60 dias ou sem pedido há 30+
  const [clients]: any = await db.execute(
    `SELECT
       c.id, c.name, c.phone, c.email, c.birthday,
       c.total_orders, c.total_spent,
       MAX(o.created_at) as last_order_date,
       -- Dias até o próximo aniversário (considerando ano atual ou próximo)
       CASE
         WHEN c.birthday IS NOT NULL THEN
           DATEDIFF(
             CASE
               WHEN DATE(CONCAT(YEAR(NOW()),'-',LPAD(MONTH(c.birthday),2,'0'),'-',LPAD(DAY(c.birthday),2,'0'))) >= CURDATE()
               THEN DATE(CONCAT(YEAR(NOW()),'-',LPAD(MONTH(c.birthday),2,'0'),'-',LPAD(DAY(c.birthday),2,'0')))
               ELSE DATE(CONCAT(YEAR(NOW())+1,'-',LPAD(MONTH(c.birthday),2,'0'),'-',LPAD(DAY(c.birthday),2,'0')))
             END,
             CURDATE()
           )
         ELSE NULL
       END as days_to_birthday,
       DATEDIFF(NOW(), MAX(o.created_at)) as days_since_last_order
     FROM clients c
     LEFT JOIN orders o ON o.client_id = c.id AND o.status IN ('delivered','confirmed')
     WHERE c.tenant_id = ? AND c.deleted_at IS NULL
     GROUP BY c.id, c.name, c.phone, c.email, c.birthday, c.total_orders, c.total_spent
     HAVING (days_to_birthday IS NOT NULL AND days_to_birthday <= 60)
        OR  (c.total_orders >= 2 AND days_since_last_order > 30)
        OR  (c.total_orders >= 3)
     ORDER BY
       CASE WHEN days_to_birthday IS NOT NULL AND days_to_birthday <= 60
            THEN days_to_birthday ELSE 999 END ASC,
       c.total_spent DESC
     LIMIT 30`,
    [tenantId]
  )

  return { clients }
}

// ── Analytics: Produtos com baixa movimentação (Desperdício potencial) ───
export async function getWasteData(tenantId: number) {
  const [products]: any = await db.execute(
    `SELECT
       p.id, p.name, p.stock, p.min_stock, p.cost_price, p.price,
       COALESCE(cat.name,'Sem categoria') as category,
       p.stock * COALESCE(p.cost_price, 0) as stock_value,
       MAX(o.created_at) as last_sale_date,
       COALESCE(DATEDIFF(NOW(), MAX(o.created_at)), DATEDIFF(NOW(), p.created_at)) as days_without_sale,
       COALESCE(SUM(oi.quantity), 0) as total_sold_30d
     FROM products p
     LEFT JOIN categories cat ON cat.id = p.category_id
     LEFT JOIN order_items oi ON oi.product_id = p.id
     LEFT JOIN orders o ON o.id = oi.order_id
       AND o.status IN ('delivered','confirmed')
       AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.is_active = 1
     GROUP BY p.id, p.name, p.stock, p.min_stock, p.cost_price, p.price, cat.name, p.created_at
     HAVING (p.stock > p.min_stock AND days_without_sale > 7)
        OR  (p.stock > 0 AND total_sold_30d = 0)
     ORDER BY stock_value DESC, days_without_sale DESC
     LIMIT 20`,
    [tenantId]
  )

  // Totais
  const [summary]: any = await db.execute(
    `SELECT
       COUNT(*) as total_products_in_stock,
       SUM(p.stock * COALESCE(p.cost_price,0)) as total_stock_value
     FROM products p
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.is_active = 1 AND p.stock > 0`,
    [tenantId]
  )

  return { products, summary: summary[0] || {} }
}
