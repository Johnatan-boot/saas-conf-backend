import { db } from '../../database/connection'

export async function createTenant(data: {
  name: string; slug: string; email: string; plan?: string
}) {
  const [result]: any = await db.execute(
    'INSERT INTO tenants (name, slug, email, plan) VALUES (?, ?, ?, ?)',
    [data.name, data.slug, data.email, data.plan || 'free']
  )
  return result.insertId
}

export async function findTenantById(id: number) {
  const [rows]: any = await db.execute(
    'SELECT * FROM tenants WHERE id = ? AND deleted_at IS NULL', [id]
  )
  return rows[0] || null
}

export async function findTenantBySlug(slug: string) {
  const [rows]: any = await db.execute(
    'SELECT * FROM tenants WHERE slug = ? AND deleted_at IS NULL', [slug]
  )
  return rows[0] || null
}

export async function updateTenant(id: number, data: Partial<{
  name: string; phone: string; address: string; logo_url: string
}>) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(data), id]
  await db.execute(`UPDATE tenants SET ${fields} WHERE id = ?`, values)
}

export async function updateTenantPlan(id: number, plan: string, stripeCustomerId?: string, stripeSubId?: string) {
  await db.execute(
    'UPDATE tenants SET plan = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id) WHERE id = ?',
    [plan, stripeCustomerId, stripeSubId, id]
  )
}

export async function listAllTenants() {
  const [rows]: any = await db.execute(
    'SELECT id, name, slug, email, plan, plan_status, created_at FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC'
  )
  return rows
}
