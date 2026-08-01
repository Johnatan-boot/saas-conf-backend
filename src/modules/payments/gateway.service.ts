// ============================================================
// gateway.service.ts
//
// Lógica de criação de sessão/preferência de pagamento, EXTRAÍDA
// de checkout.routes.ts para ser reaproveitada por:
//  - checkout.routes.ts        (staff, autenticado, /api/checkout/*)
//  - catalog.routes.ts         (público, /api/public/store/:slug/checkout/*)
//
// successUrl/cancelUrl são passados pelo CHAMADOR — assim cada
// contexto redireciona pro lugar certo (admin/payments vs catálogo).
// ============================================================
import Stripe from 'stripe'
import { MercadoPagoConfig, Preference } from 'mercadopago'

const getStripe = () => process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
const getMercadoPago = () => process.env.MERCADOPAGO_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN }) : null

export interface GatewayCheckoutInput {
  name: string
  amount: number
  quantity?: number
  customerName?: string
  customerEmail?: string
  customerDocument?: string
  customerPhone?: string
  successUrl: string
  cancelUrl: string
  // Referência externa usada para conciliar o pagamento no webhook
  // (ex: assinatura SaaS de um tenant). Opcional — não usado pelo
  // checkout de pedidos do catálogo.
  externalReference?: string
  metadata?: Record<string, string>
}

export type GatewayResult =
  | { url: string; externalId?: string }
  | { error: string; status?: number; details?: any }

export function gatewayStatus() {
  const mask = (k?: string) => !k ? 'NÃO CONFIGURADA' : k.length < 10 ? 'CURTA DEMAIS' : k.substring(0, 8) + '...'
  return {
    stripe: mask(process.env.STRIPE_SECRET_KEY),
    mercadopago_at: mask(process.env.MERCADOPAGO_ACCESS_TOKEN),
    pagarme: mask(process.env.PAGARME_API_KEY),
  }
}

// --- STRIPE ---
export async function createStripeSession(input: GatewayCheckoutInput): Promise<GatewayResult> {
  const stripe = getStripe()
  if (!stripe) return { error: 'Stripe não configurado (falta STRIPE_SECRET_KEY)', status: 400 }
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price_data: { currency: 'brl', product_data: { name: input.name }, unit_amount: Math.round(input.amount * 100) }, quantity: input.quantity || 1 }],
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.externalReference,
    metadata: input.metadata,
  })
  return { url: session.url as string, externalId: session.id }
}

// --- MERCADO PAGO ---
export async function createMercadoPagoPreference(input: GatewayCheckoutInput): Promise<GatewayResult> {
  const client = getMercadoPago()
  if (!client) return { error: 'Mercado Pago não configurado (falta MERCADOPAGO_ACCESS_TOKEN)', status: 400 }
  const preference = new Preference(client)
  const cleanDoc = input.customerDocument ? input.customerDocument.replace(/\D/g, '') : ''
  const docType = cleanDoc.length === 14 ? 'CNPJ' : 'CPF'
  const payerBody: any = { email: input.customerEmail || 'cliente@confeitaria.com' }
  if (input.customerName) payerBody.name = input.customerName
  if (cleanDoc) payerBody.identification = { type: docType, number: cleanDoc }
  const result = await preference.create({
    body: {
      items: [{ id: 'item-1', title: input.name, unit_price: input.amount, quantity: input.quantity || 1, currency_id: 'BRL' }],
      payer: payerBody,
      back_urls: { success: input.successUrl, failure: input.cancelUrl, pending: input.successUrl },
      auto_return: 'approved',
      external_reference: input.externalReference,
      metadata: input.metadata,
    },
  })
  return { url: result.init_point as string, externalId: result.id }
}

// --- PAGAR.ME ---
export async function createPagarmeCheckout(input: GatewayCheckoutInput): Promise<GatewayResult> {
  const secretKey = process.env.PAGARME_API_KEY?.trim()
  if (!secretKey) return { error: 'Pagar.me não configurado (falta PAGARME_API_KEY)', status: 400 }
  const cleanDoc = (input.customerDocument || '').replace(/\D/g, '')
  const docType = cleanDoc.length === 14 ? 'corporation' : 'individual'
  let areaCode = '11'; let phoneNumber = '999999999'
  if (input.customerPhone) {
    const cp = input.customerPhone.replace(/\D/g, '')
    if (cp.length >= 10) {
      const parsed = cp.startsWith('55') && cp.length > 11 ? cp.substring(2) : cp
      areaCode = parsed.substring(0, 2); phoneNumber = parsed.substring(2)
    }
  }
  const response = await fetch('https://api.pagar.me/core/v5/orders', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: input.externalReference || `or_${Date.now()}`,
      metadata: input.metadata,
      items: [{ amount: Math.round(input.amount * 100), description: input.name, quantity: input.quantity || 1, code: 'prd_1' }],
      customer: { name: input.customerName || 'Cliente', email: input.customerEmail || 'cliente@conf.com', type: docType, document: cleanDoc || '00000000000', phones: { mobile_phone: { country_code: '55', area_code: areaCode, number: phoneNumber } } },
      payments: [{
        payment_method: 'checkout',
        checkout: {
          expires_in: 10080, billing_address_editable: true, customer_editable: true,
          accepted_payment_methods: ['credit_card', 'pix'],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          pix: { expires_in: 86400 }
        }
      }],
    }),
  })
  const data: any = await response.json()
  if (response.status !== 200 && response.status !== 201) {
    return { error: data.message || 'Erro na API do Pagar.me', status: response.status, details: data.errors || null }
  }
  const checkoutUrl = data?.checkouts?.[0]?.payment_url
  if (!checkoutUrl) return { error: 'URL de checkout não retornada pelo Pagar.me', status: 500 }
  return { url: checkoutUrl, externalId: data?.id }
}
