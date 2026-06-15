// ============================================================
// checkout.routes.ts — uso INTERNO/admin (/api/checkout/*)
//
// Mantém o MESMO comportamento e formato de resposta de antes
// (autenticado, redireciona pra /payments). A lógica dos gateways
// foi extraída para gateway.service.ts e agora também é usada
// pelo checkout PÚBLICO do catálogo (catalog.routes.ts).
// ============================================================
import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { gatewayStatus, createStripeSession, createMercadoPagoPreference, createPagarmeCheckout } from './gateway.service'

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173'

export async function checkoutRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  // Status das chaves (diagnóstico)
  app.get('/status', async (_req, rep) => rep.send(gatewayStatus()))

  // --- STRIPE ---
  app.post('/stripe', async (req, rep) => {
    const { name, amount, quantity } = req.body as any
    const result = await createStripeSession({
      name, amount, quantity,
      successUrl: `${frontendUrl()}/payments?success=true`,
      cancelUrl: `${frontendUrl()}/payments?cancel=true`,
    })
    if ('error' in result) return rep.status(result.status || 400).send({ error: result.error })
    return rep.send({ url: result.url })
  })

  // --- MERCADO PAGO ---
  app.post('/mercadopago', async (req, rep) => {
    const { name, amount, quantity, customerName, customerEmail, customerDocument } = req.body as any
    const result = await createMercadoPagoPreference({
      name, amount, quantity, customerName, customerEmail, customerDocument,
      successUrl: `${frontendUrl()}/payments?success=true`,
      cancelUrl: `${frontendUrl()}/payments?cancel=true`,
    })
    if ('error' in result) return rep.status(result.status || 400).send({ error: result.error, details: (result as any).details })
    return rep.send({ url: result.url })
  })

  // --- PAGAR.ME ---
  app.post('/pagarme', async (req, rep) => {
    const { name, amount, quantity, customerName, customerEmail, customerDocument, customerPhone } = req.body as any
    const result = await createPagarmeCheckout({
      name, amount, quantity, customerName, customerEmail, customerDocument, customerPhone,
      successUrl: `${frontendUrl()}/payments?success=true`,
      cancelUrl: `${frontendUrl()}/payments?cancel=true`,
    })
    if ('error' in result) return rep.status(result.status || 400).send({ error: result.error, details: (result as any).details })
    return rep.send({ url: result.url })
  })
}
