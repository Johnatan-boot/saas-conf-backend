import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware'
import { listUsersService, getUserService, createUserService, updateUserService, deleteUserService } from './user.service'
import { z } from 'zod'

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (req, rep) => {
    const users = await listUsersService(req.tenantId)
    return rep.send({ success: true, data: users })
  })

  app.get('/:id', async (req, rep) => {
    const { id } = req.params as any
    const user = await getUserService(Number(id), req.tenantId)
    return rep.send({ success: true, data: user })
  })

  app.post('/', { preHandler: requireRole('admin') }, async (req, rep) => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['admin','manager','staff']).optional(),
    })
    const body = schema.parse(req.body)
    const user = await createUserService(req.tenantId, body)
    return rep.status(201).send({ success: true, data: user })
  })

  app.put('/:id', { preHandler: requireRole('admin','manager') }, async (req, rep) => {
    const { id } = req.params as any
    const schema = z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      role: z.enum(['admin','manager','staff']).optional(),
      is_active: z.boolean().optional(),
    })
    const body = schema.parse(req.body)
    const user = await updateUserService(Number(id), req.tenantId, body)
    return rep.send({ success: true, data: user })
  })

  app.delete('/:id', { preHandler: requireRole('admin') }, async (req, rep) => {
    const { id } = req.params as any
    await deleteUserService(Number(id), req.tenantId)
    return rep.send({ success: true, message: 'Usuário removido' })
  })
}
