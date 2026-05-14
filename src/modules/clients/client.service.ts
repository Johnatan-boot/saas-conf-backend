import { listClients, findClientById, createClient, updateClient, deleteClient } from './client.repository'
import { NotFoundError } from '../../shared/errors/appError'

export async function listClientsService(tenantId: number, search?: string) {
  return listClients(tenantId, search)
}
export async function getClientService(id: number, tenantId: number) {
  const c = await findClientById(id, tenantId)
  if (!c) throw new NotFoundError('Cliente')
  return c
}
export async function createClientService(tenantId: number, data: any) {
  const id = await createClient({ ...data, tenant_id: tenantId })
  return findClientById(id, tenantId)
}
export async function updateClientService(id: number, tenantId: number, data: any) {
  const c = await findClientById(id, tenantId)
  if (!c) throw new NotFoundError('Cliente')
  await updateClient(id, tenantId, data)
  return findClientById(id, tenantId)
}
export async function deleteClientService(id: number, tenantId: number) {
  const c = await findClientById(id, tenantId)
  if (!c) throw new NotFoundError('Cliente')
  await deleteClient(id, tenantId)
}
