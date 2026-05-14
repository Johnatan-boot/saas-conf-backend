import { listUsers, findUserById, updateUser, deleteUser, createUser } from './user.repository'
import { hashPassword } from '../../shared/utils/hash'
import { NotFoundError, ConflictError } from '../../shared/errors/appError'
import { findUserByEmail } from '../auth/auth.repository'

export async function listUsersService(tenantId: number) {
  return listUsers(tenantId)
}

export async function getUserService(id: number, tenantId: number) {
  const user = await findUserById(id, tenantId)
  if (!user) throw new NotFoundError('Usuário')
  return user
}

export async function createUserService(tenantId: number, data: {
  name: string; email: string; password: string; role?: string
}) {
  const existing = await findUserByEmail(data.email, tenantId)
  if (existing) throw new ConflictError('Email já cadastrado')
  const hashed = await hashPassword(data.password)
  const id = await createUser({ ...data, tenant_id: tenantId, password: hashed })
  return findUserById(id, tenantId)
}

export async function updateUserService(id: number, tenantId: number, data: any) {
  const user = await findUserById(id, tenantId)
  if (!user) throw new NotFoundError('Usuário')
  if (data.password) {
    data.password = await hashPassword(data.password)
  }
  await updateUser(id, tenantId, data)
  return findUserById(id, tenantId)
}

export async function deleteUserService(id: number, tenantId: number) {
  const user = await findUserById(id, tenantId)
  if (!user) throw new NotFoundError('Usuário')
  await deleteUser(id, tenantId)
}
