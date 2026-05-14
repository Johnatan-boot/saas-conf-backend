import { db } from '../../database/connection'

export async function logAction(data: {
  tenant_id: number; user_id?: number; action: string
  entity?: string; entity_id?: number; old_data?: any; new_data?: any; ip_address?: string
}) {
  await db.execute(
    'INSERT INTO audit_logs (tenant_id,user_id,action,entity,entity_id,old_data,new_data,ip_address) VALUES (?,?,?,?,?,?,?,?)',
    [data.tenant_id, data.user_id||null, data.action, data.entity||null, data.entity_id||null,
     data.old_data ? JSON.stringify(data.old_data) : null,
     data.new_data ? JSON.stringify(data.new_data) : null,
     data.ip_address||null]
  )
}

export async function getAuditLogs(tenantId: number, limit = 50) {
  const [rows]: any = await db.execute(
    `SELECT al.*, u.name as user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
     WHERE al.tenant_id=? ORDER BY al.created_at DESC LIMIT ?`,
    [tenantId, limit]
  )
  return rows
}
