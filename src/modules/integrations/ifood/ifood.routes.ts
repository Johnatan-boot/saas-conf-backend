// ============================================================
// ifood.routes.ts — Rotas da integração iFood (privadas)
// ============================================================

import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../middlewares/auth.middleware'
import { tenantMiddleware } from '../../../middlewares/tenant.middleware'
import { z } from 'zod'
import {
  saveIntegration, getIntegrationStatus, disconnectIntegration,
  pollIFoodOrders, listMarketplaceOrders, confirmIFoodOrder, dispatchIFoodOrder,
} from './ifood.service'
import { getIntegrationMode } from './ifood.credentials'

export async function ifoodRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  // Informa o modo de integração ativo (Step 1 ou Step 2)
  app.get('/mode', async (_req, rep) =>
    rep.send({ success: true, data: { mode: getIntegrationMode() } })
  )

  // Status da integração
  app.get('/status', async (req, rep) => {
    const data = await getIntegrationStatus(req.tenantId, 'ifood')
    return rep.send({ success: true, data })
  })

  // Salvar/atualizar credenciais
  app.post('/connect', async (req, rep) => {
    const schema = z.object({
      clientId: z.string().min(5),
      clientSecret: z.string().min(5),
      merchantId: z.string().min(3),
    })
    const body = schema.parse(req.body)
    await saveIntegration(req.tenantId, 'ifood', {
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      merchantId: body.merchantId,
    })
    return rep.status(201).send({ success: true, message: 'iFood conectado com sucesso!' })
  })

  // Desconectar
  app.post('/disconnect', async (req, rep) => {
    await disconnectIntegration(req.tenantId, 'ifood')
    return rep.send({ success: true, message: 'iFood desconectado.' })
  })

  // Polling manual (frontend chama a cada 30s ou no botão "Atualizar")
  app.post('/sync', async (req, rep) => {
    const result = await pollIFoodOrders(req.tenantId)
    return rep.send({ success: true, data: result })
  })

  // Listar pedidos importados do iFood
  app.get('/orders', async (req, rep) => {
    const rows = await listMarketplaceOrders(req.tenantId, 'ifood')
    return rep.send({ success: true, data: rows })
  })

  // Confirmar pedido no iFood
  app.post('/orders/:externalId/confirm', async (req, rep) => {
    const { externalId } = req.params as any
    await confirmIFoodOrder(req.tenantId, externalId)
    return rep.send({ success: true, message: 'Pedido confirmado no iFood.' })
  })

  // Despachar pedido
  app.post('/orders/:externalId/dispatch', async (req, rep) => {
    const { externalId } = req.params as any
    await dispatchIFoodOrder(req.tenantId, externalId)
    return rep.send({ success: true, message: 'Pedido despachado.' })
  })
}
