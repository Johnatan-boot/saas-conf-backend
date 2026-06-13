import { FastifyInstance } from 'fastify'
import { getPublicStore, getPublicProducts, createPublicOrder } from './catalog.service'
import { z } from 'zod'

// Rotas PÚBLICAS — sem auth, sem tenant middleware
export async function catalogRoutes(app: FastifyInstance) {
  // GET /api/public/store/:slug — info pública da loja
  app.get('/store/:slug', async (req, rep) => {
    const { slug } = req.params as any
    const data = await getPublicStore(slug)
    if (!data) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })
    return rep.send({ success: true, data })
  })

  // GET /api/public/store/:slug/products — produtos com stock > 0
  app.get('/store/:slug/products', async (req, rep) => {
    const { slug } = req.params as any
    const data = await getPublicProducts(slug)
    if (!data) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })
    return rep.send({ success: true, data })
  })

  // POST /api/public/store/:slug/orders — criar pedido público
  app.post('/store/:slug/orders', async (req, rep) => {
    const { slug } = req.params as any
    const schema = z.object({
      customer: z.object({
        name: z.string().min(2), phone: z.string().min(8),
        address: z.string().optional(), notes: z.string().optional(),
        email: z.string().optional(), document: z.string().optional(),
      }),
      items: z.array(z.object({
        productId: z.number(), quantity: z.number().positive(), price: z.number().positive()
      })).min(1),
      total: z.number().positive(),
      paymentMethod: z.string(),
    })
    const body = schema.parse(req.body)
    const result = await createPublicOrder(slug, body)
    if (!result) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })
    return rep.status(201).send({ success: true, data: result })
  })
}
