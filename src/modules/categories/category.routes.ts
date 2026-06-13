// ============================================================
// category.routes.ts
// Lista as categorias do tenant (para preencher o <select>
// do formulário de produtos). Apenas leitura por agora.
// ============================================================
import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { db } from '../../database/connection'

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  // GET /api/categories — lista categorias do tenant logado
  app.get('/', async (req, rep) => {
    const [rows]: any = await db.execute(
      'SELECT id, name, description FROM categories WHERE tenant_id = ? ORDER BY name ASC',
      [req.tenantId]
    )
    return rep.send({ success: true, data: rows })
  })
}
