import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { registerPayment, listPayments } from './payment.service'
import { z } from 'zod'

export async function paymentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (req, rep) => {
    return rep.send({ success:true, data: await listPayments(req.tenantId) })
  })
  app.post('/', async (req, rep) => {
    const schema = z.object({
      order_id: z.number(),
      amount: z.number().positive(),
      method: z.enum(['cash','pix','credit_card','debit_card','transfer']),
      notes: z.string().optional(),
    })
    const body = schema.parse(req.body)
    const id = await registerPayment(req.tenantId, body)
    return rep.status(201).send({ success:true, data: { id } })
  })
}
