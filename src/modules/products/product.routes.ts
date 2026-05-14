import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware'
import { listProductsService, getProductService, createProductService, updateProductService, deleteProductService, getLowStockService } from './product.service'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  cost_price: z.number().optional(),
  unit: z.string().optional(),
  stock: z.number().int().optional(),
  min_stock: z.number().int().optional(),
  category_id: z.number().optional(),
  image_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
})

export async function productRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (req, rep) => {
    const q = req.query as any
    return rep.send({ success:true, data: await listProductsService(req.tenantId, q) })
  })
  app.get('/low-stock', async (req, rep) => {
    return rep.send({ success:true, data: await getLowStockService(req.tenantId) })
  })
  app.get('/:id', async (req, rep) => {
    const { id } = req.params as any
    return rep.send({ success:true, data: await getProductService(Number(id), req.tenantId) })
  })
  app.post('/', { preHandler: requireRole('admin','manager') }, async (req, rep) => {
    return rep.status(201).send({ success:true, data: await createProductService(req.tenantId, schema.parse(req.body)) })
  })
  app.put('/:id', { preHandler: requireRole('admin','manager') }, async (req, rep) => {
    const { id } = req.params as any
    return rep.send({ success:true, data: await updateProductService(Number(id), req.tenantId, schema.partial().parse(req.body)) })
  })
  app.delete('/:id', { preHandler: requireRole('admin','manager') }, async (req, rep) => {
    const { id } = req.params as any
    await deleteProductService(Number(id), req.tenantId)
    return rep.send({ success:true, message:'Produto removido' })
  })
}
