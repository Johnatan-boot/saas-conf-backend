// ============================================================
// customer-auth.repository.ts
//
// Acessa as MESMAS tabelas `clients` e `orders` usadas pelo
// admin (módulo clients/orders). Não cria tabelas novas:
// um cliente que se cadastra no catálogo é uma linha em
// `clients` do tenant — a mesma que aparece em /clientes.
// ============================================================
import { db } from '../../database/connection'

export async function resolveTenantBySlug(slug: string): Promise<number | null> {
  const [rows]: any = await db.execute(
    'SELECT tenant_id FROM store_themes WHERE slug = ?', [slug]
  )
  return rows.length ? rows[0].tenant_id : null
}

export async function findClientByEmail(tenantId: number, email: string) {
  const [rows]: any = await db.execute(
    'SELECT * FROM clients WHERE tenant_id = ? AND email = ? AND deleted_at IS NULL LIMIT 1',
    [tenantId, email]
  )
  return rows[0] || null
}

export async function findClientById(id: number, tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT * FROM clients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
    [id, tenantId]
  )
  return rows[0] || null
}

export async function createClientAccount(tenantId: number, data: {
  name: string; email: string; phone?: string; passwordHash: string
}) {
  const [result]: any = await db.execute(
    'INSERT INTO clients (tenant_id, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
    [tenantId, data.name, data.email, data.phone || null, data.passwordHash]
  )
  return result.insertId
}

// "Reivindica" um cliente já existente (cadastrado manualmente pelo
// admin ou criado por um pedido anterior) ao definir a senha.
export async function attachPasswordToClient(clientId: number, data: {
  passwordHash: string; name?: string; phone?: string
}) {
  const sets: string[] = ['password_hash = ?']
  const params: any[] = [data.passwordHash]
  if (data.name) { sets.push('name = ?'); params.push(data.name) }
  if (data.phone) { sets.push('phone = ?'); params.push(data.phone) }
  params.push(clientId)
  await db.execute(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, params)
}

export async function updateClientProfile(clientId: number, tenantId: number, data: {
  name?: string; email?: string; phone?: string; address?: string; passwordHash?: string
}) {
  const allowed: Record<string, string> = {
    name: 'name', email: 'email', phone: 'phone', address: 'address', passwordHash: 'password_hash',
  }
  const sets: string[] = []
  const params: any[] = []
  for (const [key, column] of Object.entries(allowed)) {
    const val = (data as any)[key]
    if (val !== undefined) { sets.push(`${column} = ?`); params.push(val) }
  }
  if (!sets.length) return
  params.push(clientId, tenantId)
  await db.execute(`UPDATE clients SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, params)
}

export async function findOrdersByClient(tenantId: number, clientId: number) {
  const [rows]: any = await db.execute(
    `SELECT id, code, status, total, delivery_type, created_at
     FROM orders WHERE tenant_id = ? AND client_id = ?
     ORDER BY created_at DESC`,
    [tenantId, clientId]
  )
  return rows
}

export async function findOrderItemsByOrderIds(orderIds: number[]) {
  if (!orderIds.length) return []
  const placeholders = orderIds.map(() => '?').join(',')
  const [rows]: any = await db.execute(
    `SELECT order_id, product_name, quantity, unit_price, total_price
     FROM order_items WHERE order_id IN (${placeholders})`,
    orderIds
  )
  return rows
}
