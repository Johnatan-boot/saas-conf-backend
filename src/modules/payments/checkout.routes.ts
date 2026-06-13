// ============================================================
// checkout.routes.ts — OmniPay module adaptado para Fastify
// Mantém a lógica IDÊNTICA ao server.ts do OmniPay
// ============================================================
import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'

const getStripe = () => process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
const getMercadoPago = () => process.env.MERCADOPAGO_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN }) : null

export async function checkoutRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  // Status das chaves (diagnóstico)
  app.get('/status', async (_req, rep) => {
    const mask = (k?: string) => !k ? 'NÃO CONFIGURADA' : k.length < 10 ? 'CURTA DEMAIS' : k.substring(0, 8) + '...'
    return rep.send({
      stripe: mask(process.env.STRIPE_SECRET_KEY),
      mercadopago_at: mask(process.env.MERCADOPAGO_ACCESS_TOKEN),
      pagarme: mask(process.env.PAGARME_API_KEY),
    })
  })

  // --- STRIPE (idêntico ao OmniPay) ---
  app.post('/stripe', async (req, rep) => {
    const stripe = getStripe()
    if (!stripe) return rep.status(400).send({ error: 'Stripe não configurado (falta STRIPE_SECRET_KEY)' })
    const { name, amount, quantity = 1 } = req.body as any
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'brl', product_data: { name }, unit_amount: Math.round(amount * 100) }, quantity }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payments?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payments?cancel=true`,
    })
    return rep.send({ url: session.url })
  })

  // --- MERCADO PAGO (idêntico ao OmniPay) ---
  app.post('/mercadopago', async (req, rep) => {
    const client = getMercadoPago()
    if (!client) return rep.status(400).send({ error: 'Mercado Pago não configurado (falta MERCADOPAGO_ACCESS_TOKEN)' })
    const { name, amount, quantity = 1, customerName, customerEmail, customerDocument } = req.body as any
    const preference = new Preference(client)
    const cleanDoc = customerDocument ? customerDocument.replace(/\D/g, '') : ''
    const docType = cleanDoc.length === 14 ? 'CNPJ' : 'CPF'
    const payerBody: any = { email: customerEmail || 'cliente@confeitaria.com' }
    if (customerName) payerBody.name = customerName
    if (cleanDoc) payerBody.identification = { type: docType, number: cleanDoc }
    const result = await preference.create({
      body: {
        items: [{ id: 'item-1', title: name, unit_price: amount, quantity, currency_id: 'BRL' }],
        payer: payerBody,
        back_urls: {
          success: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payments?success=true`,
          failure: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payments?cancel=true`,
          pending: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payments`,
        },
        auto_return: 'approved',
      },
    })
    return rep.send({ url: result.init_point })
  })

  // --- PAGAR.ME (idêntico ao OmniPay) ---
  app.post('/pagarme', async (req, rep) => {
    const secretKey = process.env.PAGARME_API_KEY?.trim()
    if (!secretKey) return rep.status(400).send({ error: 'Pagar.me não configurado (falta PAGARME_API_KEY)' })
    const { name, amount, quantity = 1, customerName, customerEmail, customerDocument, customerPhone } = req.body as any
    const cleanDoc = (customerDocument || '').replace(/\D/g, '')
    const docType = cleanDoc.length === 14 ? 'corporation' : 'individual'
    let areaCode = '11'; let phoneNumber = '999999999'
    if (customerPhone) {
      const cp = customerPhone.replace(/\D/g, '')
      if (cp.length >= 10) {
        const parsed = cp.startsWith('55') && cp.length > 11 ? cp.substring(2) : cp
        areaCode = parsed.substring(0, 2); phoneNumber = parsed.substring(2)
      }
    }
    const response = await fetch('https://api.pagar.me/core/v5/orders', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `or_${Date.now()}`,
        items: [{ amount: Math.round(amount * 100), description: name, quantity, code: 'prd_1' }],
        customer: { name: customerName || 'Cliente', email: customerEmail || 'cliente@conf.com', type: docType, document: cleanDoc || '00000000000', phones: { mobile_phone: { country_code: '55', area_code: areaCode, number: phoneNumber } } },
        payments: [{
          payment_method: 'checkout',
          checkout: {
            expires_in: 10080, billing_address_editable: true, customer_editable: true,
            accepted_payment_methods: ['credit_card', 'pix'],
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payments?success=true`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payments?cancel=true`,
            pix: { expires_in: 86400 }
          }
        }],
      }),
    })
    const data: any = await response.json()
    if (response.status !== 200 && response.status !== 201) {
      return rep.status(response.status).send({ error: data.message || 'Erro na API do Pagar.me', details: data.errors || null })
    }
    const checkoutUrl = data?.checkouts?.[0]?.payment_url
    if (!checkoutUrl) return rep.status(500).send({ error: 'URL de checkout não retornada pelo Pagar.me' })
    return rep.send({ url: checkoutUrl })
  })
}
