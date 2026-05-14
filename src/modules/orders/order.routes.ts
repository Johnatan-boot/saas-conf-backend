import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware'
import { listOrdersService, getOrderService, createOrderService, updateOrderStatusService, updateOrderService, deleteOrderService } from './order.service'
import { z } from 'zod'

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (req, rep) => {
    return rep.send({ success:true, data: await listOrdersService(req.tenantId, req.query as any) })
  })
  app.get('/:id', async (req, rep) => {
    const { id } = req.params as any
    return rep.send({ success:true, data: await getOrderService(Number(id), req.tenantId) })
  })
  app.post('/', async (req, rep) => {
    const schema = z.object({
      client_id: z.number().optional(),
      items: z.array(z.object({
        product_id: z.number().optional(),
        product_name: z.string().optional(),
        quantity: z.number().int().positive(),
        unit_price: z.number().positive().optional(),
        notes: z.string().optional(),
      })).min(1),
      delivery_date: z.string().optional(),
      delivery_type: z.enum(['pickup','delivery']).optional(),
      delivery_address: z.string().optional(),
      discount: z.number().optional(),
      notes: z.string().optional(),
    })
    const body = schema.parse(req.body)
    const order = await createOrderService(req.tenantId, req.userId, body)
    return rep.status(201).send({ success:true, data: order })
  })
  app.patch('/:id/status', async (req, rep) => {
    const { id } = req.params as any
    const { status } = z.object({ status: z.string() }).parse(req.body)
    return rep.send({ success:true, data: await updateOrderStatusService(Number(id), req.tenantId, status) })
  })
  app.put('/:id', async (req, rep) => {
    const { id } = req.params as any
    return rep.send({ success:true, data: await updateOrderService(Number(id), req.tenantId, req.body) })
  })
  app.delete('/:id', { preHandler: requireRole('admin','manager') }, async (req, rep) => {
    const { id } = req.params as any
    await deleteOrderService(Number(id), req.tenantId)
    return rep.send({ success:true, message:'Pedido removido' })
  })
}
