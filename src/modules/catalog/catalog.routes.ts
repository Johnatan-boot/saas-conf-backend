import { FastifyInstance, FastifyRequest } from 'fastify'
import { getPublicStore, getPublicProducts, createPublicOrder } from './catalog.service'
import { verifyCustomerToken } from '../customer-auth/customer-auth.service'
import { createStripeSession, createMercadoPagoPreference, createPagarmeCheckout } from '../payments/gateway.service'
import { z } from 'zod'

const frontendUrl = (req?: any) => {
  // Usa a origin da requisição se disponível (robusto em qualquer ambiente)
  // Fallback: FRONTEND_URL do .env, depois URL de produção conhecida
  const origin = req?.headers?.origin
  if (origin && !origin.includes('localhost')) return origin
  return process.env.FRONTEND_URL
    || 'https://saas-conf-frontends.onrender.com'
}

// Token do cliente logado é opcional — convidado segue sem client_id.
function getOptionalClientId(req: FastifyRequest, slug: string): number | null {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verifyCustomerToken(authHeader.split(' ')[1])
      if (payload.slug === slug) return payload.clientId
    } catch { /* convidado — segue sem client_id */ }
  }
  return null
}

// ─── orderSchema ───────────────────────────────────────────────────────────
//
// ⚠️ PHONE: mantido como z.string() SEM min() — o campo é exibido como
// obrigatório no UI mas pode chegar vazio quando:
//   1. Perfil do cliente foi criado sem telefone (campo opcional no registro)
//   2. Cliente usa perfil com telefone formatado que é apagado no pré-fill
//
// O gateway.service.ts já trata telefone ausente/curto com fallback
// (areaCode='11', phoneNumber='999999999'). A validação estrita min(8)
// estava causando 422 toda vez que o usuário logado não tinha telefone
// configurado no perfil — o pedido NUNCA era criado.
//
// ⚠️ EMAIL: opcional — convidados sem cadastro podem não ter e-mail.
//
const orderSchema = z.object({
  customer: z.object({
    name:     z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
    phone:    z.string().default(''),        // ← era min(8), causava 422
    address:  z.string().optional().default(''),
    notes:    z.string().optional().default(''),
    email:    z.string().optional().default(''),  // opcional — convidados
    document: z.string().optional().default(''),
  }),
  items: z.array(z.object({
    productId: z.number(),
    quantity:  z.number().positive(),
    price:     z.number().positive(),
  })).min(1, 'Carrinho vazio'),
  total:         z.number().positive(),
  paymentMethod: z.string().default('pix'),
})

// ─── Rotas PÚBLICAS — sem auth, sem tenant middleware ─────────────────────
export async function catalogRoutes(app: FastifyInstance) {

  // GET /api/public/store/:slug
  app.get('/store/:slug', async (req, rep) => {
    const { slug } = req.params as any
    const data = await getPublicStore(slug)
    if (!data) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })
    return rep.send({ success: true, data })
  })

  // GET /api/public/store/:slug/products
  app.get('/store/:slug/products', async (req, rep) => {
    const { slug } = req.params as any
    const data = await getPublicProducts(slug)
    if (!data) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })
    return rep.send({ success: true, data })
  })

  // POST /api/public/store/:slug/orders — PIX / dinheiro / cartão na entrega
  app.post('/store/:slug/orders', async (req, rep) => {
    const { slug } = req.params as any
    const body = orderSchema.parse(req.body)
    const clientId = getOptionalClientId(req, slug)
    const result = await createPublicOrder(slug, body, clientId)
    if (!result) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })
    return rep.status(201).send({ success: true, data: result })
  })

  // POST /api/public/store/:slug/checkout/:gateway — Stripe | MercadoPago | Pagar.me
  //
  // FLUXO CORRETO (pós-fix):
  // 1. Cria o pedido (status='pending', payment_method salvo, estoque deduzido, notificações)
  // 2. Só DEPOIS gera a sessão no gateway
  // → Se o gateway falhar, a venda JÁ EXISTE e aparece em Pedidos (admin confirma manualmente)
  // → Se o gateway OK, redireciona o cliente para a URL de pagamento
  app.post('/store/:slug/checkout/:gateway', async (req, rep) => {
    const { slug, gateway } = req.params as any
    if (!['stripe', 'mercadopago', 'pagarme'].includes(gateway)) {
      return rep.status(404).send({ success: false, error: 'Gateway de pagamento não suportado' })
    }

    const body = orderSchema.parse(req.body)
    const clientId = getOptionalClientId(req, slug)

    // PASSO 1: pedido criado independente do gateway
    const order = await createPublicOrder(slug, body, clientId)
    if (!order) return rep.status(404).send({ success: false, error: 'Loja não encontrada' })

    const gatewayInput = {
      name:             `Pedido ${order.code}`,
      amount:           body.total,
      quantity:         1,
      customerName:     body.customer.name,
      customerEmail:    body.customer.email     || undefined,
      customerDocument: body.customer.document  || undefined,
      customerPhone:    body.customer.phone      || undefined,
      successUrl: `${frontendUrl(req)}/catalogo/${slug}?payment=success&order=${order.code}`,
      cancelUrl:  `${frontendUrl(req)}/catalogo/${slug}?payment=cancel&order=${order.code}`,
    }

    // PASSO 2: sessão de pagamento
    const result = gateway === 'stripe'       ? await createStripeSession(gatewayInput)
                 : gateway === 'mercadopago'  ? await createMercadoPagoPreference(gatewayInput)
                 :                              await createPagarmeCheckout(gatewayInput)

    if ('error' in result) {
      // Pedido já existe — admin vê em Pedidos e pode confirmar manualmente
      return rep.status(result.status || 400).send({
        success: false,
        error:   result.error,
        orderId: order.orderId,
        code:    order.code,
      })
    }

    return rep.status(201).send({
      success: true,
      data: { url: result.url, orderId: order.orderId, code: order.code },
    })
  })
}
