import { db } from '../../database/connection'

export async function getKPIs(tenantId: number) {
  const [[revenue]]: any = await db.execute(
    `SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(total),0) as month
     FROM orders WHERE tenant_id=? AND status='delivered' AND MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())`,
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
    'SELECT COUNT(*) as total FROM clients WHERE tenant_id=? AND deleted_at IS NULL', [tenantId]
  )
  const [[products]]: any = await db.execute(
    'SELECT COUNT(*) as total, SUM(stock<=min_stock AND is_active=1) as low_stock FROM products WHERE tenant_id=? AND deleted_at IS NULL', [tenantId]
  )
  return { revenue, orders, clients, products }
}

export async function getRevenueByDay(tenantId: number, days = 30) {
  const [rows]: any = await db.execute(
    `SELECT DATE(created_at) as date, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
     FROM orders WHERE tenant_id=? AND status='delivered' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE(created_at) ORDER BY date ASC`,
    [tenantId, days]
  )
  return rows
}

export async function getTopProducts(tenantId: number, limit = 5) {
  const [rows]: any = await db.execute(
    `SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as total_revenue
     FROM order_items oi JOIN orders o ON o.id=oi.order_id
     WHERE o.tenant_id=? AND o.status='delivered' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY oi.product_name ORDER BY total_revenue DESC LIMIT ?`,
    [tenantId, limit]
  )
  return rows
}

export async function getOrdersByStatus(tenantId: number) {
  const [rows]: any = await db.execute(
    `SELECT status, COUNT(*) as count FROM orders WHERE tenant_id=? GROUP BY status`,
    [tenantId]
  )
  return rows
}

export async function getUpcomingDeliveries(tenantId: number) {
  const [rows]: any = await db.execute(
    `SELECT o.*, c.name as client_name FROM orders o LEFT JOIN clients c ON c.id=o.client_id
     WHERE o.tenant_id=? AND o.delivery_date >= NOW() AND o.status NOT IN ('delivered','cancelled')
     ORDER BY o.delivery_date ASC LIMIT 10`,
    [tenantId]
  )
  return rows
}

export async function getTopClients(tenantId: number, limit = 5) {
  const [rows]: any = await db.execute(
    `SELECT c.id, c.name, c.phone, c.total_orders, c.total_spent
     FROM clients c WHERE c.tenant_id=? AND c.deleted_at IS NULL
     ORDER BY c.total_spent DESC LIMIT ?`,
    [tenantId, limit]
  )
  return rows
}
