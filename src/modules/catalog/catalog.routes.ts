import { FastifyInstance, FastifyRequest } from 'fastify'
import { getPublicStore, getPublicProducts, createPublicOrder } from './catalog.service'
import { verifyCustomerToken } from '../customer-auth/customer-auth.service'
import { createStripeSession, createMercadoPagoPreference, createPagarmeCheckout } from '../payments/gateway.service'
import { z } from 'zod'

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173'

// Checkout pode ser feito logado (vincula ao cliente) ou como
// convidado. Token inválido/ausente/de outro tenant = segue
// como convidado, sem travar o pedido.
function getOptionalClientId(req: FastifyRequest, slug: string): number | null {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verifyCustomerToken(authHeader.split(' ')[1])
      if (payload.slug === slug) return payload.clientId
    } catch { /* convidado */ }
  }
  return null
}

const orderSchema = z.object({
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
  // (PIX, dinheiro, cartão na entrega — pagamento combinado fora do app)
  app.post('/store/:slug/orders', async (req, rep) => {
    const { slug } = req.params as any
    const body = orderSchema.parse(req.body)
    const clientId = getOptionalClientId(req, slug)

    const result = await createPublicOrder(slug, body, clientId)
    if (!result) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })
    return rep.status(201).send({ success: true, data: result })
  })

  // POST /api/public/store/:slug/checkout/:gateway — pagamento ONLINE
  // (stripe | mercadopago | pagarme)
  //
  // 🔴 ANTES: o frontend chamava direto /api/checkout/{gateway} (que
  // exige login de STAFF) e NUNCA criava o pedido — cliente pagava e
  // nada ficava registrado no sistema.
  //
  // ✅ AGORA: cria o pedido PRIMEIRO (status 'pending', com
  // payment_method salvo) e SÓ DEPOIS gera a sessão de pagamento.
  // Assim, mesmo sem webhook do gateway, a venda fica registrada,
  // o estoque é deduzido e o lojista é notificado (Zapier/Telegram) —
  // confirmar o pagamento em si ainda é manual (ver AUDITORIA.md).
  app.post('/store/:slug/checkout/:gateway', async (req, rep) => {
    const { slug, gateway } = req.params as any
    if (!['stripe', 'mercadopago', 'pagarme'].includes(gateway)) {
      return rep.status(404).send({ success: false, error: 'Forma de pagamento desconhecida' })
    }

    const body = orderSchema.parse(req.body)
    const clientId = getOptionalClientId(req, slug)

    const order = await createPublicOrder(slug, body, clientId)
    if (!order) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })

    const gatewayInput = {
      name: `Pedido ${order.code}`,
      amount: body.total,
      quantity: 1,
      customerName: body.customer.name,
      customerEmail: body.customer.email,
      customerDocument: body.customer.document,
      customerPhone: body.customer.phone,
      successUrl: `${frontendUrl()}/catalogo/${slug}?payment=success&order=${order.code}`,
      cancelUrl: `${frontendUrl()}/catalogo/${slug}?payment=cancel&order=${order.code}`,
    }

    const result = gateway === 'stripe' ? await createStripeSession(gatewayInput)
      : gateway === 'mercadopago' ? await createMercadoPagoPreference(gatewayInput)
      : await createPagarmeCheckout(gatewayInput)

    if ('error' in result) {
      // O pedido já existe (status pending) mesmo se o gateway falhar
      // aqui — o admin consegue ver em Pedidos e seguir manualmente.
      return rep.status(result.status || 400).send({
        success: false, error: result.error, orderId: order.orderId, code: order.code,
      })
    }

    return rep.status(201).send({ success: true, data: { url: result.url, orderId: order.orderId, code: order.code } })
  })
}
