// ============================================================
// customer-auth.middleware.ts
//
// Protege rotas do CLIENTE FINAL (Meus Pedidos, Perfil).
// Diferente do authMiddleware (staff): valida um token com
// type='customer' e confirma que o tenant do token corresponde
// ao :slug da URL — assim um cliente da Loja A não consegue
// usar o token dele na Loja B.
// ============================================================
import { FastifyRequest, FastifyReply } from 'fastify'
import { UnauthorizedError } from '../../shared/errors/appError'
import { verifyCustomerToken } from './customer-auth.service'
import { resolveTenantBySlug } from './customer-auth.repository'

export async function customerAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Faça login para continuar')
  }

  const token = authHeader.split(' ')[1]
  let payload
  try {
    payload = verifyCustomerToken(token)
  } catch {
    throw new UnauthorizedError('Sessão expirada. Faça login novamente.')
  }

  const { slug } = request.params as any
  const tenantId = await resolveTenantBySlug(slug)
  if (!tenantId || tenantId !== payload.tenantId) {
    throw new UnauthorizedError('Sessão inválida para esta loja')
  }

  request.tenantId = payload.tenantId
  request.clientId = payload.clientId
}
