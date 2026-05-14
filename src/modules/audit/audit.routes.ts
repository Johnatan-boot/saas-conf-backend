import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware'
import { getAuditLogs } from './audit.service'

export async function auditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', requireRole('admin'))

  app.get('/', async (req, rep) => {
    const { limit } = req.query as any
    return rep.send({ success:true, data: await getAuditLogs(req.tenantId, Number(limit)||50) })
  })
}
