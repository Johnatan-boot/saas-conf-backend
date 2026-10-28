import { db } from '../../database/connection'
import { sendPurchaseConfirmation } from '../notifications/purchase-email.service'

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

export const CYCLE_DISCOUNT: Record<string, number> = {
  mensal: 1,
  '12x':  0.90,
  '24x':  0.85,
  '36x':  0.80,
}

export async function createPendingSubscription(data: {
  tenantId: number; plan: string; billingCycle: string
  pricePerMonth: number; totalMonths: number
  gateway: string; externalReference: string
}) {
  const [res]: any = await db.execute(
    `INSERT INTO subscriptions
     (tenant_id, plan, billing_cycle, price_per_month, total_months, started_at, status, gateway, external_reference, payment_status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), 'trial', ?, ?, 'pending')`,
    [data.tenantId, data.plan, data.billingCycle, data.pricePerMonth, data.totalMonths, data.gateway, data.externalReference]
  )
  return res.insertId
}

export async function findSubscriptionByExternalReference(externalReference: string) {
  const [rows]: any = await db.execute(
    'SELECT * FROM subscriptions WHERE external_reference = ? ORDER BY id DESC LIMIT 1',
    [externalReference]
  )
  return rows[0] || null
}

export async function findLatestSubscriptionForTenant(tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1',
    [tenantId]
  )
  return rows[0] || null
}

export async function markSubscriptionPaid(id: number) {
  const sub = await (async () => {
    const [rows]: any = await db.execute('SELECT * FROM subscriptions WHERE id = ?', [id])
    return rows[0]
  })()
  if (!sub) return

  const started = new Date()
  const expires = new Date(started)
  expires.setMonth(expires.getMonth() + Number(sub.total_months || 1))

  await db.execute(
    `UPDATE subscriptions
     SET payment_status = 'paid', status = 'active', started_at = CURDATE(),
         expires_at = ?, updated_at = NOW()
     WHERE id = ?`,
    [sub.total_months > 1 ? expires.toISOString().split('T')[0] : null, id]
  )

  const limits: Record<string, { max_users: number; max_products: number; max_orders_month: number }> = {
    economico: { max_users: 1, max_products: 30, max_orders_month: 50 },
    standard:  { max_users: 5, max_products: 200, max_orders_month: 300 },
    premium:   { max_users: 9999, max_products: 9999, max_orders_month: 9999 },
  }
  const l = limits[sub.plan] || limits.economico
  await db.execute(
    `UPDATE tenants SET plan = ?, plan_status = 'active',
     max_users = ?, max_products = ?, max_orders_month = ?, updated_at = NOW()
     WHERE id = ?`,
    [sub.plan, l.max_users, l.max_products, l.max_orders_month, sub.tenant_id]
  )

  // E-mail de confirmação + recibo em PDF (não bloqueia nem derruba o webhook)
  void sendPurchaseConfirmation(id)
}

export async function markSubscriptionFailed(id: number) {
  await db.execute(
    "UPDATE subscriptions SET payment_status = 'failed', updated_at = NOW() WHERE id = ?",
    [id]
  )
}
