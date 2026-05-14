import { db } from '../../database/connection'
import { NotFoundError, AppError } from '../../shared/errors/appError'

export async function registerPayment(tenantId: number, data: {
  order_id: number; amount: number; method: string; notes?: string
}) {
  const [orders]: any = await db.execute('SELECT id FROM orders WHERE id=? AND tenant_id=?', [data.order_id, tenantId])
  if (!orders.length) throw new NotFoundError('Pedido')
  const [r]: any = await db.execute(
    'INSERT INTO payments (tenant_id,order_id,amount,method,status,paid_at) VALUES (?,?,?,?,?,NOW())',
    [tenantId, data.order_id, data.amount, data.method, 'paid']
  )
  await db.execute("UPDATE orders SET paid_at=NOW(), status='confirmed' WHERE id=? AND tenant_id=?", [data.order_id, tenantId])
  return r.insertId
}

export async function listPayments(tenantId: number) {
  const [rows]: any = await db.execute(
    `SELECT p.*, o.code as order_code, c.name as client_name
     FROM payments p JOIN orders o ON o.id=p.order_id LEFT JOIN clients c ON c.id=o.client_id
     WHERE p.tenant_id=? ORDER BY p.created_at DESC`,
    [tenantId]
  )
  return rows
}
