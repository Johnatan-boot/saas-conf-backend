import { db } from '../../database/connection'

export async function findUserByEmail(email: string, tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT id, tenant_id, name, email, password, role, is_active FROM users WHERE email = ? AND tenant_id = ? AND deleted_at IS NULL',
    [email, tenantId]
  )
  return rows[0] || null
}

export async function createUser(data: {
  tenant_id: number
  name: string
  email: string
  password: string
  role?: string
}) {
  const [result]: any = await db.execute(
    'INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
    [data.tenant_id, data.name, data.email, data.password, data.role || 'staff']
  )
  return result.insertId
}

export async function saveRefreshToken(userId: number, token: string) {
  await db.execute('UPDATE users SET refresh_token = ?, last_login = NOW() WHERE id = ?', [token, userId])
}

export async function findUserByRefreshToken(token: string) {
  const [rows]: any = await db.execute(
    'SELECT id, tenant_id, role FROM users WHERE refresh_token = ? AND deleted_at IS NULL',
    [token]
  )
  return rows[0] || null
}

export async function clearRefreshToken(userId: number) {
  await db.execute('UPDATE users SET refresh_token = NULL WHERE id = ?', [userId])
}
