import { hashPassword, comparePassword } from '../../shared/utils/hash'
import { signToken, signRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt'
import { AppError, UnauthorizedError, ConflictError } from '../../shared/errors/appError'
import {
  findUserByEmail, createUser, saveRefreshToken,
  findUserByRefreshToken, clearRefreshToken
} from './auth.repository'
import { findTenantById } from '../tenants/tenant.repository'

export async function loginService(tenantId: number, email: string, password: string) {
  const user = await findUserByEmail(email, tenantId)
  if (!user) throw new UnauthorizedError('Credenciais inválidas')
  if (!user.is_active) throw new UnauthorizedError('Usuário inativo')

  const valid = await comparePassword(password, user.password)
  if (!valid) throw new UnauthorizedError('Credenciais inválidas')

  const accessToken = signToken({ userId: user.id, tenantId: user.tenant_id, role: user.role })
  const refreshToken = signRefreshToken({ userId: user.id, tenantId: user.tenant_id })

  await saveRefreshToken(user.id, refreshToken)

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  }
}

export async function registerService(tenantId: number, data: {
  name: string; email: string; password: string; role?: string
}) {
  const existing = await findUserByEmail(data.email, tenantId)
  if (existing) throw new ConflictError('Email já cadastrado neste tenant')

  const hashed = await hashPassword(data.password)
  const userId = await createUser({ ...data, tenant_id: tenantId, password: hashed })

  const accessToken = signToken({ userId, tenantId, role: data.role || 'staff' })
  return { accessToken, userId }
}

export async function refreshTokenService(refreshToken: string) {
  let payload: any
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw new UnauthorizedError('Refresh token inválido')
  }

  const user = await findUserByRefreshToken(refreshToken)
  if (!user) throw new UnauthorizedError('Refresh token não encontrado')

  const accessToken = signToken({ userId: user.id, tenantId: user.tenant_id, role: user.role })
  const newRefresh = signRefreshToken({ userId: user.id, tenantId: user.tenant_id })
  await saveRefreshToken(user.id, newRefresh)

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutService(userId: number) {
  await clearRefreshToken(userId)
}
