import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../database/connection'
import { AppError } from '../shared/errors/appError'

export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
 const tenantIdHeader = request.headers['x-tenant-id']
const tenantSlug = request.headers['x-tenant-slug']

const hasTenantId = tenantIdHeader !== undefined && tenantIdHeader !== null && tenantIdHeader !== ''
const hasTenantSlug = tenantSlug !== undefined && tenantSlug !== null && tenantSlug !== ''

if (!hasTenantId && !hasTenantSlug) {
  throw new AppError('Tenant não identificado. Envie X-Tenant-Slug ou X-Tenant-ID no header.', 400)
}

let query = 'SELECT id, name, slug, plan, plan_status FROM tenants WHERE deleted_at IS NULL AND '
let param: any

if (hasTenantSlug) {
  query += 'slug = ?'
  param = tenantSlug
} else {
  query += 'id = ?'
  param = Number(tenantIdHeader)
}

  const [rows]: any = await db.execute(query, [param])

  if (!rows || rows.length === 0) {
    throw new AppError('Tenant não encontrado', 404)
  }

  const tenant = rows[0]

  if (tenant.plan_status === 'suspended') {
    throw new AppError('Conta suspensa. Entre em contato com o suporte.', 403)
  }

  if (tenant.plan_status === 'cancelled') {
    throw new AppError('Conta cancelada.', 403)
  }

  request.tenantId = tenant.id
  request.tenant = tenant
}
