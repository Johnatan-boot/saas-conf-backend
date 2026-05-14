import { db } from '../../database/connection'

export async function listOrders(tenantId: number, filters?: { status?:string; client_id?:number; date_from?:string; date_to?:string }) {
  let sql = `SELECT o.*, c.name as client_name, u.name as user_name
    FROM orders o
    LEFT JOIN clients c ON c.id=o.client_id
    LEFT JOIN users u ON u.id=o.user_id
    WHERE o.tenant_id=?`
  const params: any[] = [tenantId]
  if (filters?.status) { sql+=' AND o.status=?'; params.push(filters.status) }
  if (filters?.client_id) { sql+=' AND o.client_id=?'; params.push(filters.client_id) }
  if (filters?.date_from) { sql+=' AND DATE(o.created_at)>=?'; params.push(filters.date_from) }
  if (filters?.date_to) { sql+=' AND DATE(o.created_at)<=?'; params.push(filters.date_to) }
  sql += ' ORDER BY o.created_at DESC'
  const [rows]: any = await db.execute(sql, params)
  return rows
}

export async function findOrderById(id: number, tenantId: number) {
  const [rows]: any = await db.execute(
    `SELECT o.*, c.name as client_name FROM orders o LEFT JOIN clients c ON c.id=o.client_id WHERE o.id=? AND o.tenant_id=?`,
    [id, tenantId]
  )
  if (!rows[0]) return null
  const order = rows[0]
  const [items]: any = await db.execute(
    'SELECT oi.*, p.image_url FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?',
    [id]
  )
  order.items = items
  return order
}

export async function createOrder(data: any) {
  const code = `PED-${Date.now()}`
  const [r]: any = await db.execute(
    'INSERT INTO orders (tenant_id,client_id,user_id,code,status,delivery_date,delivery_type,delivery_address,subtotal,discount,total,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [data.tenant_id,data.client_id||null,data.user_id||null,code,data.status||'pending',data.delivery_date||null,data.delivery_type||'pickup',data.delivery_address||null,data.subtotal||0,data.discount||0,data.total,data.notes||null]
  )
  return r.insertId
}

export async function addOrderItem(orderId: number, item: any) {
  await db.execute(
    'INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,total_price,notes) VALUES (?,?,?,?,?,?,?)',
    [orderId,item.product_id||null,item.product_name,item.quantity,item.unit_price,item.quantity*item.unit_price,item.notes||null]
  )
}

export async function updateOrderStatus(id: number, tenantId: number, status: string) {
  await db.execute('UPDATE orders SET status=? WHERE id=? AND tenant_id=?',[status,id,tenantId])
}

export async function updateOrder(id: number, tenantId: number, data: any) {
  const allowed=['delivery_date','delivery_type','delivery_address','discount','total','notes','internal_notes','status']
  const fields=Object.keys(data).filter(k=>allowed.includes(k))
  if(!fields.length)return
  const set=fields.map(f=>`${f}=?`).join(', ')
  await db.execute(`UPDATE orders SET ${set} WHERE id=? AND tenant_id=?`,[...fields.map(f=>data[f]),id,tenantId])
}

export async function deleteOrder(id: number, tenantId: number) {
  await db.execute('DELETE FROM order_items WHERE order_id=?',[id])
  await db.execute('DELETE FROM orders WHERE id=? AND tenant_id=?',[id,tenantId])
}
