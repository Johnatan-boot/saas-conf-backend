// ============================================================
// superadmin.middleware.ts
//
// Protege rotas cross-tenant do Super Admin.
// Valida JWT normalmente (via authMiddleware) e depois
// checa se role === 'super_admin'. Não exige x-tenant-slug.
// ============================================================
import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '../../shared/utils/jwt'
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/appError'

export async function superAdminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Acesso negado')
  }
  try {
    const payload = verifyToken(authHeader.split(' ')[1])
    if (payload.role !== 'super_admin') {
      throw new ForbiddenError('Acesso restrito ao Super Admin')
    }
    request.userId    = payload.userId
    request.tenantId  = payload.tenantId
    request.userRole  = payload.role
  } catch (e: any) {
    if (e.name === 'ForbiddenError') throw e
    throw new UnauthorizedError('Token inválido ou expirado')
  }
}
