import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { getKPIs, getRevenueByDay, getTopProducts, getOrdersByStatus, getUpcomingDeliveries, getTopClients } from './dashboard.repository'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  app.get('/kpis', async (req, rep) => {
    return rep.send({ success:true, data: await getKPIs(req.tenantId) })
  })
  app.get('/revenue', async (req, rep) => {
    const { days } = req.query as any
    return rep.send({ success:true, data: await getRevenueByDay(req.tenantId, Number(days)||30) })
  })
  app.get('/top-products', async (req, rep) => {
    return rep.send({ success:true, data: await getTopProducts(req.tenantId) })
  })
  app.get('/orders-by-status', async (req, rep) => {
    return rep.send({ success:true, data: await getOrdersByStatus(req.tenantId) })
  })
  app.get('/upcoming-deliveries', async (req, rep) => {
    return rep.send({ success:true, data: await getUpcomingDeliveries(req.tenantId) })
  })
  app.get('/top-clients', async (req, rep) => {
    return rep.send({ success:true, data: await getTopClients(req.tenantId) })
  })
}
