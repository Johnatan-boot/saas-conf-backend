import { FastifyRequest, FastifyReply } from 'fastify'
import { loginService, registerService, refreshTokenService, logoutService } from './auth.service'
import { loginSchema, registerSchema } from './auth.schema'

export async function loginController(request: FastifyRequest, reply: FastifyReply) {
  const body = loginSchema.parse(request.body)
  const result = await loginService(request.tenantId, body.email, body.password)
  return reply.status(200).send({ success: true, data: result })
}

export async function registerController(request: FastifyRequest, reply: FastifyReply) {
  const body = registerSchema.parse(request.body)
  const result = await registerService(request.tenantId, body)
  return reply.status(201).send({ success: true, data: result })
}

export async function refreshController(request: FastifyRequest, reply: FastifyReply) {
  const { refreshToken } = request.body as any
  if (!refreshToken) throw new Error('refreshToken obrigatório')
  const result = await refreshTokenService(refreshToken)
  return reply.send({ success: true, data: result })
}

export async function logoutController(request: FastifyRequest, reply: FastifyReply) {
  await logoutService(request.userId)
  return reply.send({ success: true, message: 'Logout realizado' })
}

export async function meController(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    success: true,
    data: { userId: request.userId, tenantId: request.tenantId, role: request.userRole }
  })
}
