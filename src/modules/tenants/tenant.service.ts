import { createTenant, findTenantById, findTenantBySlug, updateTenant, listAllTenants } from './tenant.repository'
import { createUser } from '../users/user.repository'
import { hashPassword } from '../../shared/utils/hash'
import { ConflictError, NotFoundError } from '../../shared/errors/appError'
import { signToken } from '../../shared/utils/jwt'

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function onboardTenant(data: {
  tenantName: string
  adminName: string
  adminEmail: string
  adminPassword: string
}) {
  let slug = slugify(data.tenantName)
  const existing = await findTenantBySlug(slug)
  if (existing) slug = `${slug}-${Date.now()}`

  const tenantId = await createTenant({ name: data.tenantName, slug, email: data.adminEmail })
  const hashedPwd = await hashPassword(data.adminPassword)
  const userId = await createUser({
    tenant_id: tenantId, name: data.adminName,
    email: data.adminEmail, password: hashedPwd, role: 'admin'
  })

  const accessToken = signToken({ userId, tenantId, role: 'admin' })
  const tenant = await findTenantById(tenantId)

  return { tenant, accessToken, userId }
}

export async function getTenantProfile(tenantId: number) {
  const tenant = await findTenantById(tenantId)
  if (!tenant) throw new NotFoundError('Tenant')
  return tenant
}

export async function updateTenantProfile(tenantId: number, data: any) {
  const tenant = await findTenantById(tenantId)
  if (!tenant) throw new NotFoundError('Tenant')
  await updateTenant(tenantId, data)
  return findTenantById(tenantId)
}
