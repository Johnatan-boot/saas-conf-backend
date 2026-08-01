// ============================================================
// subscription.routes.ts — /api/subscriptions/*
//
// Fluxo: o próprio tenant (recém-cadastrado ou já existente)
// escolhe o gateway e paga a assinatura do plano que selecionou
// no formulário de cadastro. Substitui a criação manual de
// assinatura que antes era feita pelo super admin.
//
// POST /checkout        (autenticado)  -> cria sessão de pagamento
// GET  /status          (autenticado)  -> status da assinatura atual
// POST /webhook/:gateway (público)     -> confirmação assíncrona de pagamento
// ============================================================
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import Stripe from 'stripe'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware, requireRole } from '../../middlewares/auth.middleware'
import { env } from '../../config/env'
import { findTenantById } from '../tenants/tenant.repository'
import {
  createStripeSession, createMercadoPagoPreference, createPagarmeCheckout,
} from '../payments/gateway.service'
import {
  PLAN_PRICES, CYCLE_MONTHS, CYCLE_DISCOUNT,
  createPendingSubscription, findSubscriptionByExternalReference,
  findLatestSubscriptionForTenant, markSubscriptionPaid, markSubscriptionFailed,
} from './subscription.repository'

const frontendUrl = (req?: any) => {
  const origin = req?.headers?.origin
  if (origin && !origin.includes('localhost')) return origin
  return process.env.FRONTEND_URL || 'https://saas-conf-frontends.onrender.com'
}

export async function subscriptionRoutes(app: FastifyInstance) {
  // ── Rotas autenticadas (o tenant paga a própria assinatura) ────────────
  app.register(async (authed) => {
    authed.addHook('preHandler', tenantMiddleware)
    authed.addHook('preHandler', authMiddleware)

    authed.post('/checkout', { preHandler: requireRole('admin') }, async (req, rep) => {
      const schema = z.object({
        gateway: z.enum(['stripe', 'mercadopago', 'pagarme']),
        billingCycle: z.enum(['mensal', '12x', '24x', '36x']).default('mensal'),
        customerName: z.string().optional(),
        customerEmail: z.string().email().optional(),
        customerDocument: z.string().optional(),
        customerPhone: z.string().optional(),
      })
      const body = schema.parse(req.body)

      const tenant = await findTenantById(req.tenantId)
      if (!tenant) return rep.status(404).send({ success: false, error: 'Confeitaria não encontrada' })

      const plan = tenant.plan as string
      const basePrice = PLAN_PRICES[plan] ?? PLAN_PRICES.economico
      const totalMonths = CYCLE_MONTHS[body.billingCycle]
      const pricePerMonth = Number((basePrice * CYCLE_DISCOUNT[body.billingCycle]).toFixed(2))
      const totalAmount = Number((pricePerMonth * totalMonths).toFixed(2))

      const externalReference = `sub_${tenant.id}_${Date.now()}`
      const successUrl = `${frontendUrl(req)}/assinatura/retorno?status=sucesso&ref=${externalReference}`
      const cancelUrl  = `${frontendUrl(req)}/assinatura/retorno?status=cancelado&ref=${externalReference}`

      const commonInput = {
        name: `SweetFlow — Plano ${plan} (${body.billingCycle})`,
        amount: totalAmount,
        quantity: 1,
        customerName: body.customerName || tenant.name,
        customerEmail: body.customerEmail || tenant.email,
        customerDocument: body.customerDocument,
        customerPhone: body.customerPhone,
        successUrl, cancelUrl,
        externalReference,
        metadata: { tenantId: String(tenant.id), plan, billingCycle: body.billingCycle },
      }

      const result = body.gateway === 'stripe'
        ? await createStripeSession(commonInput)
        : body.gateway === 'mercadopago'
        ? await createMercadoPagoPreference(commonInput)
        : await createPagarmeCheckout(commonInput)

      if ('error' in result) {
        return rep.status(result.status || 400).send({ success: false, error: result.error, details: (result as any).details })
      }

      await createPendingSubscription({
        tenantId: tenant.id, plan, billingCycle: body.billingCycle,
        pricePerMonth, totalMonths, gateway: body.gateway, externalReference,
      })

      return rep.send({ success: true, data: { url: result.url } })
    })

    authed.get('/status', async (req, rep) => {
      const tenant = await findTenantById(req.tenantId)
      const subscription = await findLatestSubscriptionForTenant(req.tenantId)
      return rep.send({
        success: true,
        data: {
          planStatus: tenant?.plan_status,
          plan: tenant?.plan,
          subscription,
        },
      })
    })
  })

  // ── Webhooks públicos dos gateways ──────────────────────────────────────
  // ⚠️ Antes de ir para produção: confirme com cada gateway a validação de
  // assinatura/segredo do webhook (aqui o Stripe já valida via
  // STRIPE_WEBHOOK_SECRET; Mercado Pago e Pagar.me fazem uma confirmação
  // best-effort consultando a API do próprio gateway, mas o ideal é também
  // validar o header de assinatura deles antes de confiar no payload).

  app.post('/webhook/stripe', async (req, rep) => {
    const stripeSecret = env.stripeSecretKey
    const webhookSecret = env.stripeWebhookSecret
    if (!stripeSecret) return rep.status(400).send({ error: 'Stripe não configurado' })
    const stripe = new Stripe(stripeSecret)

    let event: Stripe.Event
    try {
      const sig = req.headers['stripe-signature'] as string
      const rawBody = (req as any).rawBody
      if (webhookSecret && rawBody) {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      } else {
        event = req.body as Stripe.Event
      }
    } catch (err: any) {
      return rep.status(400).send({ error: `Assinatura inválida: ${err.message}` })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const ref = session.client_reference_id
      if (ref) {
        const sub = await findSubscriptionByExternalReference(ref)
        if (sub) await markSubscriptionPaid(sub.id)
      }
    }

    return rep.send({ received: true })
  })

  app.post('/webhook/mercadopago', async (req, rep) => {
    try {
      const query = req.query as any
      const body = req.body as any
      const topic = query.topic || query.type || body?.type
      const paymentId = query['data.id'] || body?.data?.id

      if (topic === 'payment' && paymentId) {
        const token = process.env.MERCADOPAGO_ACCESS_TOKEN
        if (!token) return rep.send({ received: true })
        const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const payment: any = await resp.json()
        const ref = payment?.external_reference
        if (ref) {
          const sub = await findSubscriptionByExternalReference(ref)
          if (sub) {
            if (payment.status === 'approved') await markSubscriptionPaid(sub.id)
            else if (['rejected', 'cancelled'].includes(payment.status)) await markSubscriptionFailed(sub.id)
          }
        }
      }
    } catch (err) {
      req.log.error(err, 'Erro ao processar webhook Mercado Pago')
    }
    return rep.send({ received: true })
  })

  app.post('/webhook/pagarme', async (req, rep) => {
    try {
      const body = req.body as any
      const type = body?.type as string
      const order = body?.data
      const ref = order?.code
      if (ref) {
        const sub = await findSubscriptionByExternalReference(ref)
        if (sub) {
          if (type === 'order.paid' || order?.status === 'paid') await markSubscriptionPaid(sub.id)
          else if (type === 'order.payment_failed' || type === 'order.canceled') await markSubscriptionFailed(sub.id)
        }
      }
    } catch (err) {
      req.log.error(err, 'Erro ao processar webhook Pagar.me')
    }
    return rep.send({ received: true })
  })
}
