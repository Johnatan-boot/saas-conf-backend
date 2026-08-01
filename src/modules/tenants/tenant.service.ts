import { createTenant, findTenantById, findTenantBySlug, updateTenant, listAllTenants, recordContractAcceptance } from './tenant.repository'
import { createUser } from '../users/user.repository'
import { hashPassword } from '../../shared/utils/hash'
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/appError'
import { signToken } from '../../shared/utils/jwt'
import { CONTRACT_VERSION } from '../contracts/contract.content'

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
  plan?: string
  contractAccepted: boolean
  ipAddress?: string
  userAgent?: string
}) {
  if (!data.contractAccepted) {
    throw new ValidationError('É necessário ler e aceitar o Contrato de Prestação de Serviços para continuar.')
  }

  let slug = slugify(data.tenantName)
  const existing = await findTenantBySlug(slug)
  if (existing) slug = `${slug}-${Date.now()}`

  const plan = data.plan || 'economico'

  const tenantId = await createTenant({
    name:  data.tenantName,
    slug,
    email: data.adminEmail,
    plan,
  })
  const hashedPwd = await hashPassword(data.adminPassword)
  const userId = await createUser({
    tenant_id: tenantId, name: data.adminName,
    email: data.adminEmail, password: hashedPwd, role: 'admin'
  })

  // Registra o aceite do contrato para fins de auditoria/LGPD
  await recordContractAcceptance({
    tenantId, plan, contractVersion: CONTRACT_VERSION,
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  const accessToken = signToken({ userId, tenantId, role: 'admin' })
  const tenant = await findTenantById(tenantId)

  return { tenant, accessToken, userId, contractVersion: CONTRACT_VERSION }
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
