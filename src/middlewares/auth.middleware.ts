import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '../shared/utils/jwt'
import { UnauthorizedError, ForbiddenError } from '../shared/errors/appError'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token de autenticação não fornecido')
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = verifyToken(token)
    request.userId = payload.userId
    request.tenantId = payload.tenantId
    request.userRole = payload.role
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado')
  }
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.userRole)) {
      throw new ForbiddenError(`Acesso negado. Roles permitidas: ${roles.join(', ')}`)
    }
  }
}
