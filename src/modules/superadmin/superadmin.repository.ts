// ============================================================
// superadmin.repository.ts
//
// Queries cross-tenant — sem filtro por tenant_id.
// Só acessível por usuários com role='super_admin'.
// ============================================================
import { db } from '../../database/connection'

export const PLAN_PRICES: Record<string, number> = {
  economico: 49.90,
  standard:  99.90,
  premium:   199.90,
}

export const CYCLE_MONTHS: Record<string, number> = {
  mensal: 1,
  '12x':  12,
  '24x':  24,
  '36x':  36,
}

// ── Tenants ───────────────────────────────────────────────────────────────

export async function getAllTenants() {
  const [rows]: any = await db.execute(
    `SELECT
       t.id, t.name, t.slug, t.email, t.plan, t.plan_status,
       t.phone, t.created_at, t.deleted_at,
       t.max_users, t.max_products, t.max_orders_month,
       (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id AND u.role != 'super_admin') AS user_count,
       (SELECT COUNT(*) FROM orders o WHERE o.tenant_id=t.id) AS total_orders,
       (SELECT COUNT(*) FROM clients c WHERE c.tenant_id=t.id AND c.deleted_at IS NULL) AS total_clients,
       (SELECT COALESCE(SUM(o2.total),0) FROM orders o2 WHERE o2.tenant_id=t.id AND o2.status='delivered') AS total_revenue,
       (SELECT s.billing_cycle FROM subscriptions s WHERE s.tenant_id=t.id AND s.status='active' ORDER BY s.created_at DESC LIMIT 1) AS billing_cycle,
       (SELECT s.price_per_month FROM subscriptions s WHERE s.tenant_id=t.id AND s.status='active' ORDER BY s.created_at DESC LIMIT 1) AS price_per_month,
       (SELECT s.expires_at FROM subscriptions s WHERE s.tenant_id=t.id AND s.status='active' ORDER BY s.created_at DESC LIMIT 1) AS expires_at
     FROM tenants t
     WHERE t.id != 1
     ORDER BY t.created_at DESC`
  )
  return rows
}

export async function getTenantById(id: number) {
  const [rows]: any = await db.execute(
    'SELECT * FROM tenants WHERE id = ?', [id]
  )
  return rows[0] || null
}

export async function updateTenantPlan(tenantId: number, plan: string, planStatus: string) {
  const limits = {
    economico: { max_users: 1, max_products: 30, max_orders_month: 50 },
    standard:  { max_users: 5, max_products: 200, max_orders_month: 300 },
    premium:   { max_users: 9999, max_products: 9999, max_orders_month: 9999 },
  } as any
  const l = limits[plan] || limits.economico
  await db.execute(
    `UPDATE tenants SET plan=?, plan_status=?,
     max_users=?, max_products=?, max_orders_month=?, updated_at=NOW()
     WHERE id=?`,
    [plan, planStatus, l.max_users, l.max_products, l.max_orders_month, tenantId]
  )
}

// ── Subscriptions ─────────────────────────────────────────────────────────

export async function getAllSubscriptions() {
  const [rows]: any = await db.execute(
    `SELECT s.*, t.name AS tenant_name, t.slug, t.email AS tenant_email
     FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id
     ORDER BY s.created_at DESC`
  )
  return rows
}

export async function createSubscription(data: {
  tenantId: number; plan: string; billingCycle: string
  pricePerMonth: number; totalMonths: number
  startedAt: string; expiresAt?: string | null; notes?: string
}) {
  const [res]: any = await db.execute(
    `INSERT INTO subscriptions
     (tenant_id, plan, billing_cycle, price_per_month, total_months, started_at, expires_at, notes, status)
     VALUES (?,?,?,?,?,?,?,?,'active')`,
    [data.tenantId, data.plan, data.billingCycle, data.pricePerMonth,
     data.totalMonths, data.startedAt, data.expiresAt || null, data.notes || null]
  )
  return res.insertId
}

export async function updateSubscriptionStatus(id: number, status: string) {
  await db.execute(
    'UPDATE subscriptions SET status=?, updated_at=NOW() WHERE id=?',
    [status, id]
  )
}

// ── Revenue KPIs ──────────────────────────────────────────────────────────

export async function getRevenueSummary() {
  // MRR: soma das mensalidades ativas por plano
  const [byPlan]: any = await db.execute(
    `SELECT
       t.plan,
       COUNT(*) AS tenant_count,
       SUM(COALESCE(s.price_per_month, 0)) AS mrr
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id=t.id AND s.status='active'
     WHERE t.id != 1 AND t.deleted_at IS NULL AND t.plan_status='active'
     GROUP BY t.plan`
  )

  const [statusCount]: any = await db.execute(
    `SELECT plan_status, COUNT(*) AS count
     FROM tenants WHERE id != 1 AND deleted_at IS NULL GROUP BY plan_status`
  )

  const [monthlyGrowth]: any = await db.execute(
    `SELECT DATE_FORMAT(created_at,'%Y-%m') AS month, COUNT(*) AS new_tenants
     FROM tenants WHERE id != 1 AND deleted_at IS NULL
     GROUP BY DATE_FORMAT(created_at,'%Y-%m')
     ORDER BY month DESC LIMIT 12`
  )

  const [recentSubs]: any = await db.execute(
    `SELECT s.*, t.name AS tenant_name, t.plan
     FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id
     ORDER BY s.created_at DESC LIMIT 10`
  )

  return { byPlan, statusCount, monthlyGrowth: monthlyGrowth.reverse(), recentSubs }
}
