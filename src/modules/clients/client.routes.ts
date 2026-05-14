import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { listClientsService, getClientService, createClientService, updateClientService, deleteClientService } from './client.service'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export async function clientRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (req, rep) => {
    const { search } = req.query as any
    return rep.send({ success:true, data: await listClientsService(req.tenantId, search) })
  })
  app.get('/:id', async (req, rep) => {
    const { id } = req.params as any
    return rep.send({ success:true, data: await getClientService(Number(id), req.tenantId) })
  })
  app.post('/', async (req, rep) => {
    const body = schema.parse(req.body)
    return rep.status(201).send({ success:true, data: await createClientService(req.tenantId, body) })
  })
  app.put('/:id', async (req, rep) => {
    const { id } = req.params as any
    const body = schema.partial().parse(req.body)
    return rep.send({ success:true, data: await updateClientService(Number(id), req.tenantId, body) })
  })
  app.delete('/:id', async (req, rep) => {
    const { id } = req.params as any
    await deleteClientService(Number(id), req.tenantId)
    return rep.send({ success:true, message:'Cliente removido' })
  })
}
