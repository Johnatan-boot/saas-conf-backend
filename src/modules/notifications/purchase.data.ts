// ============================================================
// purchase.data.ts — dados da compra usados no e-mail e no recibo
//
// ⚠️ Mantenha os valores de PLAN_LIMITS, CYCLE_DISCOUNT e TERMS em linha
// com subscription.repository.ts e com o contrato do frontend
// (saas-conf-frontend/src/data/saasContract.ts).
// ============================================================
import { db } from '../../database/connection'
import { CONTRACT_VERSION } from '../contracts/contract.content'

export const COMPANY = {
  name:    process.env.COMPANY_NAME    || 'Mastercode',
  product: 'SweetFlow',
  cnpj:    process.env.COMPANY_CNPJ    || '',
  address: process.env.COMPANY_ADDRESS || '',
  email:   process.env.COMPANY_EMAIL   || process.env.SMTP_USER || '',
}

export const TERMS = {
  arrependimentoDias: 7,
  multaFidelidadePct: 20,
  avisoPrevioDias: 30,
}

const PLAN_LABELS: Record<string, string> = {
  economico: 'Econômico', standard: 'Standard', premium: 'Premium',
}
const PLAN_LIMITS: Record<string, string[]> = {
  economico: ['1 usuário', 'até 30 produtos', 'até 50 pedidos/mês'],
  standard:  ['até 5 usuários', 'até 200 produtos', 'até 300 pedidos/mês'],
  premium:   ['usuários ilimitados', 'produtos ilimitados', 'pedidos ilimitados'],
}
const CYCLE_LABELS: Record<string, string> = {
  mensal: 'Mensal', '12x': '12 meses', '24x': '24 meses', '36x': '36 meses',
}
const CYCLE_DISCOUNT_PCT: Record<string, number> = { mensal: 0, '12x': 10, '24x': 15, '36x': 20 }
const GATEWAY_LABELS: Record<string, string> = {
  stripe: 'Stripe', mercadopago: 'Mercado Pago', pagarme: 'Pagar.me',
}

export interface PurchaseData {
  receiptNumber: string
  subscriptionId: number
  externalReference: string
  gateway: string
  paidAt: Date
  customerName: string
  customerEmail: string
  tenantName: string
  planName: string
  planFeatures: string[]
  cycleLabel: string
  discountPct: number
  fidelity: boolean
  totalMonths: number
  pricePerMonth: number
  totalAmount: number
  startedAt: string | null
  expiresAt: string | null
  contractVersion: string
  contractAcceptedAt: Date | null
  multaFidelidadePct: number
  arrependimentoDias: number
  arrependimentoAte: Date
}

const fmtDate = (v: any): string | null => {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

export async function loadPurchaseData(subscriptionId: number): Promise<PurchaseData | null> {
  const [subRows]: any = await db.execute('SELECT * FROM subscriptions WHERE id = ?', [subscriptionId])
  const sub = subRows[0]
  if (!sub) return null

  const [tenantRows]: any = await db.execute('SELECT * FROM tenants WHERE id = ?', [sub.tenant_id])
  const tenant = tenantRows[0]
  if (!tenant) return null

  const [accRows]: any = await db.execute(
    'SELECT contract_version, accepted_at FROM contract_acceptances WHERE tenant_id = ? ORDER BY id DESC LIMIT 1',
    [sub.tenant_id]
  )
  const acc = accRows[0]

  const pricePerMonth = Number(sub.price_per_month)
  const totalMonths = Number(sub.total_months || 1)
  const paidAt = new Date()
  const arrependimentoAte = new Date(paidAt)
  arrependimentoAte.setDate(arrependimentoAte.getDate() + TERMS.arrependimentoDias)

  return {
    receiptNumber: `REC-${paidAt.getFullYear()}-${String(sub.id).padStart(6, '0')}`,
    subscriptionId: sub.id,
    externalReference: sub.external_reference || `sub_${sub.id}`,
    gateway: GATEWAY_LABELS[sub.gateway] || sub.gateway || '—',
    paidAt,
    customerName: tenant.name,
    customerEmail: tenant.email,
    tenantName: tenant.name,
    planName: PLAN_LABELS[sub.plan] || sub.plan,
    planFeatures: PLAN_LIMITS[sub.plan] || [],
    cycleLabel: CYCLE_LABELS[sub.billing_cycle] || sub.billing_cycle,
    discountPct: CYCLE_DISCOUNT_PCT[sub.billing_cycle] ?? 0,
    fidelity: totalMonths > 1,
    totalMonths,
    pricePerMonth,
    totalAmount: Number((pricePerMonth * totalMonths).toFixed(2)),
    startedAt: fmtDate(sub.started_at),
    expiresAt: fmtDate(sub.expires_at),
    contractVersion: acc?.contract_version || CONTRACT_VERSION,
    contractAcceptedAt: acc?.accepted_at ? new Date(acc.accepted_at) : null,
    multaFidelidadePct: TERMS.multaFidelidadePct,
    arrependimentoDias: TERMS.arrependimentoDias,
    arrependimentoAte,
  }
}

export const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const dateBR = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

export const dateTimeBR = (d: Date | null) =>
  d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
