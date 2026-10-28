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
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

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
  // Assinatura SaaS: 'pix' (Mercado Pago transparente) ou 'card' (Checkout Pro só cartão)
  paymentMethod?: 'pix' | 'card'
  // Máximo de parcelas no cartão (1 = à vista)
  maxInstallments?: number
  // URL pública do webhook (só enviada quando o backend não está em localhost)
  notificationUrl?: string
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

// ============================================================
// Validadores e helpers compartilhados (CPF/CNPJ, telefone, e-mail)
// ============================================================
export const onlyDigits = (v?: string) => (v || '').replace(/\D/g, '')

export function isValidCPF(value?: string): boolean {
  const c = onlyDigits(value)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  let add = 0
  for (let i = 0; i < 9; i++) add += parseInt(c.charAt(i)) * (10 - i)
  let rev = 11 - (add % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(c.charAt(9))) return false
  add = 0
  for (let i = 0; i < 10; i++) add += parseInt(c.charAt(i)) * (11 - i)
  rev = 11 - (add % 11)
  if (rev === 10 || rev === 11) rev = 0
  return rev === parseInt(c.charAt(10))
}

export function isValidCNPJ(value?: string): boolean {
  const c = onlyDigits(value)
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const digit = (size: number) => {
    let sum = 0, pos = size - 7
    for (let i = size; i >= 1; i--) { sum += Number(c.charAt(size - i)) * pos--; if (pos < 2) pos = 9 }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return digit(12) === Number(c.charAt(12)) && digit(13) === Number(c.charAt(13))
}

/** Telefone brasileiro -> { country_code, area_code, number }. Retorna null se inválido. */
export function splitBrazilPhone(raw?: string) {
  let p = onlyDigits(raw)
  if (p.startsWith('55') && p.length > 11) p = p.substring(2)
  if (p.length < 10 || p.length > 11) return null
  return { country_code: '55', area_code: p.substring(0, 2), number: p.substring(2) }
}

// ============================================================
// MERCADO PAGO
// ============================================================
// O Mercado Pago bloqueia o vendedor de comprar de si mesmo: se o e-mail do
// pagador for o da conta que gerou o Access Token, o botão de pagar / gerar
// código PIX não funciona. Por isso o e-mail do pagador nunca pode ser igual.
const MP_FALLBACK_BUYER_EMAIL = 'comprador.cliente@gmail.com'
let mpSellerEmailCache: string | null = null

export async function getMercadoPagoSellerEmail(): Promise<string> {
  const fromEnv = process.env.MERCADOPAGO_SELLER_EMAIL?.trim().toLowerCase()
  if (fromEnv) return fromEnv
  if (mpSellerEmailCache !== null) return mpSellerEmailCache
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) return ''
  try {
    const resp = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` } })
    if (resp.ok) {
      const data: any = await resp.json()
      mpSellerEmailCache = String(data?.email || '').trim().toLowerCase()
      return mpSellerEmailCache
    }
  } catch { /* segue sem o e-mail do vendedor */ }
  return ''
}

export async function getSafeBuyerEmail(email?: string): Promise<string> {
  if (!email || !email.includes('@')) return MP_FALLBACK_BUYER_EMAIL
  const clean = email.trim().toLowerCase()
  const seller = await getMercadoPagoSellerEmail()
  if (seller && clean === seller) {
    console.warn('[Mercado Pago] E-mail do pagador igual ao da conta vendedora; usando e-mail alternativo para evitar bloqueio de auto-venda.')
    return MP_FALLBACK_BUYER_EMAIL
  }
  return clean
}

// CPF/CNPJ só é enviado se for matematicamente válido (documento inválido gera
// erro 2067 "Invalid user identification number"); caso contrário é omitido.
function mpIdentification(doc?: string) {
  const d = onlyDigits(doc)
  if (isValidCPF(d)) return { type: 'CPF', number: d }
  if (isValidCNPJ(d)) return { type: 'CNPJ', number: d }
  return undefined
}

function splitName(full?: string) {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || undefined, last: parts.slice(1).join(' ') || undefined }
}

export async function createMercadoPagoPreference(input: GatewayCheckoutInput): Promise<GatewayResult> {
  const client = getMercadoPago()
  if (!client) return { error: 'Mercado Pago não configurado (falta MERCADOPAGO_ACCESS_TOKEN)', status: 400 }
  const preference = new Preference(client)
  const isCard = input.paymentMethod === 'card'
  const { first, last } = splitName(input.customerName)
  const payerBody: any = { email: await getSafeBuyerEmail(input.customerEmail) }
  if (first) payerBody.name = first
  if (last) payerBody.surname = last
  const identification = mpIdentification(input.customerDocument)
  if (identification) payerBody.identification = identification

  const body: any = {
    items: [{ id: 'item-1', title: input.name, unit_price: input.amount, quantity: input.quantity || 1, currency_id: 'BRL' }],
    payer: payerBody,
    back_urls: { success: input.successUrl, failure: input.cancelUrl, pending: input.successUrl },
    external_reference: input.externalReference,
    metadata: input.metadata,
  }
  if (input.notificationUrl) body.notification_url = input.notificationUrl

  if (isCard) {
    // Assinatura: Checkout Pro abre direto no cartão (sem boleto e sem PIX; o PIX é transparente).
    // Sem auto_return: o cliente conclui a revisão e clica para voltar.
    body.payment_methods = {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }],
      installments: Math.min(12, Math.max(1, input.maxInstallments || 12)),
    }
  } else if (String(input.successUrl).startsWith('https://')) {
    // Fluxo do catálogo (inalterado): auto_return só com https.
    body.auto_return = 'approved'
  }

  const result = await preference.create({ body })
  return { url: result.init_point as string, externalId: result.id }
}

export interface MercadoPagoPix {
  paymentId: number
  qrCode: string
  qrCodeBase64: string
  ticketUrl?: string
  amount: number
  status?: string
  expiresAt?: string
}
export type PixGatewayResult =
  | { pix: MercadoPagoPix; externalId: string }
  | { error: string; status?: number; details?: any }

/** PIX transparente: cria o pagamento direto na API e devolve QR Code + "copia e cola". */
export async function createMercadoPagoPix(input: GatewayCheckoutInput): Promise<PixGatewayResult> {
  const client = getMercadoPago()
  if (!client) return { error: 'Mercado Pago não configurado (falta MERCADOPAGO_ACCESS_TOKEN)', status: 400 }
  const payment = new Payment(client)
  const { first, last } = splitName(input.customerName)
  const payer: any = { email: await getSafeBuyerEmail(input.customerEmail) }
  if (first) payer.first_name = first
  if (last) payer.last_name = last
  const identification = mpIdentification(input.customerDocument)
  if (identification) payer.identification = identification

  const body: any = {
    transaction_amount: Number(input.amount.toFixed(2)),
    description: input.name,
    payment_method_id: 'pix',
    payer,
    external_reference: input.externalReference,
    metadata: input.metadata,
  }
  if (input.notificationUrl) body.notification_url = input.notificationUrl

  try {
    const response: any = await payment.create({
      body,
      requestOptions: input.externalReference ? { idempotencyKey: input.externalReference } : undefined,
    })
    const td = response?.point_of_interaction?.transaction_data
    if (!td?.qr_code) {
      console.error('[Mercado Pago] PIX criado sem QR Code:', JSON.stringify(response))
      return { error: 'O Mercado Pago não retornou o código PIX. Verifique se a conta vendedora tem uma chave PIX cadastrada.', status: 502 }
    }
    return {
      externalId: String(response.id),
      pix: {
        paymentId: response.id,
        qrCode: td.qr_code,
        qrCodeBase64: td.qr_code_base64,
        ticketUrl: td.ticket_url,
        amount: Number(input.amount),
        status: response.status,
        expiresAt: response.date_of_expiration,
      },
    }
  } catch (err: any) {
    console.error('[Mercado Pago] Erro ao criar PIX:', err?.message, JSON.stringify(err?.cause || {}))
    const cause = err?.cause
    const details = Array.isArray(cause)
      ? Object.fromEntries(cause.map((c: any, i: number) => [String(c?.code ?? i), c?.description || JSON.stringify(c)]))
      : undefined
    return { error: err?.message || 'Erro ao gerar PIX no Mercado Pago', status: 400, details }
  }
}

// ============================================================
// PAGAR.ME v5: Link de Pagamento (POST /paymentlinks)
// Docs: https://docs.pagar.me/reference/criar-link
// NÃO usar /orders com payment_method "checkout" (erro "not available for this account").
// ============================================================
export async function createPagarmeCheckout(input: GatewayCheckoutInput): Promise<GatewayResult> {
  const secretKey = process.env.PAGARME_API_KEY?.trim()
  if (!secretKey) return { error: 'Pagar.me não configurado (falta PAGARME_API_KEY)', status: 400 }
  const baseUrl = (process.env.PAGARME_BASE_URL?.trim() || 'https://api.pagar.me/core/v5').replace(/\/+$/, '')

  const totalCents = Math.round(input.amount * 100)

  // A API exige a tabela de parcelas quando type = "order" (1x até no máximo 12x, parcela mínima R$ 5,00).
  const maxInstallments = Math.min(12, input.maxInstallments || 12, Math.max(1, Math.floor(totalCents / 500)))
  const installments = Array.from({ length: maxInstallments }, (_, i) => ({ number: i + 1, total: totalCents }))

  const payload: any = {
    type: 'order',
    name: String(input.name).slice(0, 64),
    order_code: input.externalReference,      // correlação com o webhook (order.code)
    expires_in: 10080,                         // 7 dias, em minutos
    max_paid_sessions: 1,                      // link de uso único
    payment_settings: {
      accepted_payment_methods: ['credit_card', 'pix'],
      credit_card_settings: {
        operation_type: 'auth_and_capture',
        max_installments: maxInstallments,
        installments,
      },
      pix_settings: { expires_in: 86400 },     // 24h
    },
    cart_settings: {
      items: [{
        name: String(input.name).slice(0, 64),
        amount: totalCents,
        default_quantity: input.quantity || 1,
      }],
    },
  }

  // Pré-preenche o cliente apenas com dados REAIS e válidos (nada de dados fictícios).
  const doc = onlyDigits(input.customerDocument)
  if ((isValidCPF(doc) || isValidCNPJ(doc)) && input.customerName && input.customerEmail) {
    const customer: any = {
      name: input.customerName,
      email: input.customerEmail,
      type: doc.length === 14 ? 'corporation' : 'individual',
      document: doc,
    }
    const phone = splitBrazilPhone(input.customerPhone)
    if (phone) customer.phones = { mobile_phone: phone }
    payload.customer_settings = { customer }
  }

  const response = await fetch(`${baseUrl}/paymentlinks`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data: any = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('[Pagar.me] Erro ao criar link de pagamento:', response.status, JSON.stringify(data))
    return { error: data?.message || 'Erro na API do Pagar.me', status: response.status, details: data?.errors || null }
  }
  if (!data?.url) return { error: 'URL de checkout não retornada pelo Pagar.me', status: 500 }
  return { url: data.url, externalId: data?.id }
}
