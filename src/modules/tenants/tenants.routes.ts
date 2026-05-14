import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware'
import { onboardTenant, getTenantProfile, updateTenantProfile } from './tenant.service'
import { z } from 'zod'

export async function tenantRoutes(app: FastifyInstance) {
  // Rota pública — cadastro de nova confeitaria
  app.post('/onboard', async (request, reply) => {
    const schema = z.object({
      tenantName: z.string().min(2),
      adminName: z.string().min(2),
      adminEmail: z.string().email(),
      adminPassword: z.string().min(6),
    })
    const body = schema.parse(request.body)
    const result = await onboardTenant(body)
    return reply.status(201).send({ success: true, data: result })
  })

  // Rotas protegidas
  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', tenantMiddleware)
    protectedRoutes.addHook('preHandler', authMiddleware)

    protectedRoutes.get('/profile', async (request, reply) => {
      const tenant = await getTenantProfile(request.tenantId)
      return reply.send({ success: true, data: tenant })
    })

    protectedRoutes.put('/profile', { preHandler: requireRole('admin') }, async (request, reply) => {
      const schema = z.object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
      })
      const body = schema.parse(request.body)
      const tenant = await updateTenantProfile(request.tenantId, body)
      return reply.send({ success: true, data: tenant })
    })
  })
}
