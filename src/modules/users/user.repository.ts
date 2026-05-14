import { db } from '../../database/connection'

export async function createUser(data: {
  tenant_id: number; name: string; email: string; password: string; role?: string
}) {
  const [result]: any = await db.execute(
    'INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
    [data.tenant_id, data.name, data.email, data.password, data.role || 'staff']
  )
  return result.insertId
}

export async function listUsers(tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT id, name, email, role, is_active, last_login, created_at FROM users WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name',
    [tenantId]
  )
  return rows
}

export async function findUserById(id: number, tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT id, name, email, role, is_active, last_login, created_at FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
    [id, tenantId]
  )
  return rows[0] || null
}

export async function updateUser(id: number, tenantId: number, data: any) {
  const allowed = ['name', 'email', 'role', 'is_active']
  const fields = Object.keys(data).filter(k => allowed.includes(k))
  if (!fields.length) return
  const setClause = fields.map(f => `${f} = ?`).join(', ')
  const values = [...fields.map(f => data[f]), id, tenantId]
  await db.execute(`UPDATE users SET ${setClause} WHERE id = ? AND tenant_id = ?`, values)
}

export async function deleteUser(id: number, tenantId: number) {
  await db.execute('UPDATE users SET deleted_at = NOW() WHERE id = ? AND tenant_id = ?', [id, tenantId])
}
