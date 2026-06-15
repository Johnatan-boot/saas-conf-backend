// ============================================================
// customer-auth.service.ts
//
// Auth de CLIENTE FINAL do catálogo público — separado do auth
// de STAFF (módulo auth/). JWT tem `type: 'customer'` para não
// ser confundido com o token de funcionário.
// ============================================================
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { hashPassword, comparePassword } from '../../shared/utils/hash'
import { UnauthorizedError, ConflictError, NotFoundError } from '../../shared/errors/appError'
import {
  resolveTenantBySlug, findClientByEmail, findClientById,
  createClientAccount, attachPasswordToClient, updateClientProfile,
  findOrdersByClient, findOrderItemsByOrderIds,
} from './customer-auth.repository'

export interface CustomerJwtPayload {
  clientId: number
  tenantId: number
  slug: string
  type: 'customer'
}

function signCustomerToken(payload: Omit<CustomerJwtPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'customer' }, env.jwtSecret, { expiresIn: '30d' })
}

export function verifyCustomerToken(token: string): CustomerJwtPayload {
  const payload = jwt.verify(token, env.jwtSecret) as any
  if (payload?.type !== 'customer') throw new Error('Token não é de cliente')
  return payload as CustomerJwtPayload
}

function sanitizeClient(c: any) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone || '',
    address: c.address || '',
    totalOrders: c.total_orders || 0,
    totalSpent: Number(c.total_spent || 0),
  }
}

export async function registerCustomerService(slug: string, data: {
  name: string; email: string; password: string; phone?: string
}) {
  const tenantId = await resolveTenantBySlug(slug)
  if (!tenantId) throw new NotFoundError('Loja')

  const passwordHash = await hashPassword(data.password)
  const existing = await findClientByEmail(tenantId, data.email)

  let clientId: number
  if (existing) {
    if (existing.password_hash) {
      throw new ConflictError('Este e-mail já possui uma conta. Faça login.')
    }
    // Cliente já existia (cadastrado pelo admin) — reivindica a conta
    await attachPasswordToClient(existing.id, { passwordHash, name: data.name, phone: data.phone })
    clientId = existing.id
  } else {
    clientId = await createClientAccount(tenantId, { ...data, passwordHash })
  }

  const client = await findClientById(clientId, tenantId)
  const accessToken = signCustomerToken({ clientId, tenantId, slug })
  return { accessToken, client: sanitizeClient(client) }
}

export async function loginCustomerService(slug: string, email: string, password: string) {
  const tenantId = await resolveTenantBySlug(slug)
  if (!tenantId) throw new NotFoundError('Loja')

  const client = await findClientByEmail(tenantId, email)
  if (!client || !client.password_hash) throw new UnauthorizedError('E-mail ou senha inválidos')

  const valid = await comparePassword(password, client.password_hash)
  if (!valid) throw new UnauthorizedError('E-mail ou senha inválidos')

  const accessToken = signCustomerToken({ clientId: client.id, tenantId, slug })
  return { accessToken, client: sanitizeClient(client) }
}

export async function getCustomerProfileService(tenantId: number, clientId: number) {
  const client = await findClientById(clientId, tenantId)
  if (!client) throw new NotFoundError('Cliente')
  return sanitizeClient(client)
}

export async function updateCustomerProfileService(tenantId: number, clientId: number, data: {
  name?: string; email?: string; phone?: string; address?: string; newPassword?: string
}) {
  const client = await findClientById(clientId, tenantId)
  if (!client) throw new NotFoundError('Cliente')

  if (data.email && data.email !== client.email) {
    const other = await findClientByEmail(tenantId, data.email)
    if (other && other.id !== clientId && other.password_hash) {
      throw new ConflictError('Este e-mail já está em uso por outra conta.')
    }
  }

  const passwordHash = data.newPassword ? await hashPassword(data.newPassword) : undefined
  await updateClientProfile(clientId, tenantId, {
    name: data.name, email: data.email, phone: data.phone, address: data.address,
    passwordHash,
  })

  return getCustomerProfileService(tenantId, clientId)
}

export async function getMyOrdersService(tenantId: number, clientId: number) {
  const orders = await findOrdersByClient(tenantId, clientId)
  if (!orders.length) return []

  const items = await findOrderItemsByOrderIds(orders.map((o: any) => o.id))
  const itemsByOrder = new Map<number, any[]>()
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) || []
    list.push({
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      totalPrice: Number(item.total_price),
    })
    itemsByOrder.set(item.order_id, list)
  }

  return orders.map((o: any) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    total: Number(o.total),
    deliveryType: o.delivery_type,
    createdAt: o.created_at,
    items: itemsByOrder.get(o.id) || [],
  }))
}
