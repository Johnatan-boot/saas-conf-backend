import { db } from '../../database/connection'

export async function listClients(tenantId: number, search?: string) {
  let sql = 'SELECT * FROM clients WHERE tenant_id = ? AND deleted_at IS NULL'
  const params: any[] = [tenantId]
  if (search) { sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`) }
  sql += ' ORDER BY name'
  const [rows]: any = await db.execute(sql, params)
  return rows
}

export async function findClientById(id: number, tenantId: number) {
  const [rows]: any = await db.execute('SELECT * FROM clients WHERE id=? AND tenant_id=? AND deleted_at IS NULL',[id,tenantId])
  return rows[0]||null
}

export async function createClient(data: any) {
  const [r]: any = await db.execute(
    'INSERT INTO clients (tenant_id,name,email,phone,birthday,address,notes) VALUES (?,?,?,?,?,?,?)',
    [data.tenant_id,data.name,data.email||null,data.phone||null,data.birthday||null,data.address||null,data.notes||null]
  )
  return r.insertId
}

export async function updateClient(id: number, tenantId: number, data: any) {
  const allowed=['name','email','phone','birthday','address','notes']
  const fields=Object.keys(data).filter(k=>allowed.includes(k))
  if(!fields.length)return
  const set=fields.map(f=>`${f}=?`).join(', ')
  await db.execute(`UPDATE clients SET ${set} WHERE id=? AND tenant_id=?`,[...fields.map(f=>data[f]),id,tenantId])
}

export async function deleteClient(id: number, tenantId: number) {
  await db.execute('UPDATE clients SET deleted_at=NOW() WHERE id=? AND tenant_id=?',[id,tenantId])
}

export async function updateClientStats(clientId: number) {
  await db.execute(`
    UPDATE clients c SET
      total_orders=(SELECT COUNT(*) FROM orders WHERE client_id=c.id),
      total_spent=(SELECT COALESCE(SUM(total),0) FROM orders WHERE client_id=c.id AND status NOT IN ('cancelled'))
    WHERE id=?`,[clientId])
}
