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
  createStripeSession, createMercadoPagoPreference, createMercadoPagoPix, createPagarmeCheckout,
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

// URL pública do backend para o Mercado Pago avisar o pagamento (webhook).
// Em localhost não existe URL pública: retorna undefined e a confirmação é feita
// pela consulta ativa (GET /mercadopago/payment/:id) que o frontend faz sozinho.
const publicApiUrl = (req: any): string | undefined => {
  const fromEnv = (process.env.PUBLIC_API_URL || process.env.BACKEND_URL || '').trim().replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
  if (!host || /localhost|127\.0\.0\.1|\[::1\]/.test(host)) return undefined
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0]
  return `${proto}://${host}`
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
        // Mercado Pago: 'pix' (QR Code transparente) ou 'card' (Checkout Pro só cartão)
        paymentMethod: z.enum(['pix', 'card']).optional(),
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
        paymentMethod: body.paymentMethod,
        // Plano mensal é à vista; ciclos longos permitem parcelar em até 12x.
        maxInstallments: body.billingCycle === 'mensal' ? 1 : 12,
        notificationUrl: publicApiUrl(req)
          ? `${publicApiUrl(req)}/api/subscriptions/webhook/mercadopago`
          : undefined,
      }

      // Mercado Pago + PIX transparente: devolve o QR Code para o próprio sistema exibir.
      if (body.gateway === 'mercadopago' && body.paymentMethod === 'pix') {
        const pixResult = await createMercadoPagoPix(commonInput)
        if ('error' in pixResult) {
          return rep.status(pixResult.status || 400).send({ success: false, error: pixResult.error, details: pixResult.details })
        }
        await createPendingSubscription({
          tenantId: tenant.id, plan, billingCycle: body.billingCycle,
          pricePerMonth, totalMonths, gateway: body.gateway, externalReference,
        })
        return rep.send({ success: true, data: { pix: pixResult.pix, externalReference } })
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

    // Consulta o pagamento direto no Mercado Pago e ativa o plano se estiver aprovado.
    // Funciona mesmo sem webhook (ex.: teste local) e é usado pelo frontend para
    // acompanhar o PIX e confirmar o retorno do cartão. Só confia na API do gateway.
    authed.get('/mercadopago/payment/:paymentId', async (req, rep) => {
      const { paymentId } = req.params as { paymentId: string }
      if (!/^\d+$/.test(paymentId)) return rep.status(400).send({ success: false, error: 'ID de pagamento inválido' })
      const token = process.env.MERCADOPAGO_ACCESS_TOKEN
      if (!token) return rep.status(400).send({ success: false, error: 'Mercado Pago não configurado (falta MERCADOPAGO_ACCESS_TOKEN)' })

      const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return rep.status(404).send({ success: false, error: 'Pagamento não encontrado no Mercado Pago' })
      const payment: any = await resp.json()

      const sub = payment?.external_reference
        ? await findSubscriptionByExternalReference(payment.external_reference)
        : null
      if (!sub || Number(sub.tenant_id) !== Number(req.tenantId)) {
        return rep.status(404).send({ success: false, error: 'Pagamento não pertence a esta assinatura' })
      }

      if (payment.status === 'approved' && sub.payment_status !== 'paid') {
        await markSubscriptionPaid(sub.id)
      } else if (['rejected', 'cancelled'].includes(payment.status) && sub.payment_status === 'pending') {
        await markSubscriptionFailed(sub.id)
      }
      return rep.send({
        success: true,
        data: { status: payment.status, statusDetail: payment.status_detail, paid: payment.status === 'approved' },
      })
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
