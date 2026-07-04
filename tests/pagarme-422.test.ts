// ================================================================
// Reproduz e verifica o fix do bug 422 no checkout do Pagar.me.
//
// CAUSA: orderSchema tinha phone: z.string().min(8).
// Quando o cliente logado não tinha telefone no perfil (ou era
// string vazia), o Zod rejeitava o payload com 422 — o pedido
// NUNCA era criado e o gateway NUNCA era chamado.
//
// FIX: phone: z.string().default('') — gateway.service já trata
// telefone ausente com fallback (areaCode='11', number='999...').
// ================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

const TENANT_ID = 2

vi.mock('mysql2/promise', () => ({ default: { createPool: () => pool() }, createPool: () => pool() }))
vi.mock('../src/shared/utils/hash', () => ({ hashPassword: async (p: string) => p, comparePassword: async () => true }))
vi.mock('../src/shared/webhooks/zapier', () => ({ triggerZapier: vi.fn(() => Promise.resolve()), ZapierEvents: { NEW_ORDER: 'x' } }))
vi.mock('../src/modules/telegram/telegram.bot', () => ({ notifyAllSessions: vi.fn(() => Promise.resolve()) }))
vi.mock('../src/modules/payments/gateway.service', () => ({
  createPagarmeCheckout: vi.fn(async (input: any) => {
    console.log('PAGARME_PHONE_RECEBIDO:', input.customerPhone || '(vazio)')
    return { url: 'https://pagar.me/checkout/test-session' }
  }),
  createStripeSession: vi.fn(async () => ({ url: 'https://x' })),
  createMercadoPagoPreference: vi.fn(async () => ({ url: 'https://x' })),
}))

let orders: any[] = []
function pool() {
  return {
    execute: async (sqlRaw: string, params: any[] = []) => {
      const q = sqlRaw.replace(/\s+/g, ' ').trim().toLowerCase()
      if (q.includes('select tenant_id from store_themes where slug')) return [[{ tenant_id: TENANT_ID }]]
      if (q.startsWith('select id, stock from products')) return [[{ id: params[0], stock: 100 }]]
      if (q.startsWith('select name from products')) return [[{ name: 'Bolo Artesanal' }]]
      if (q.startsWith('insert into orders')) { orders.push({ id: orders.length + 1, payment_method: params[6] || params[4] }); return [{ insertId: orders.length }] }
      if (q.startsWith('insert into order_items')) return [{ insertId: 1 }]
      if (q.startsWith('update products set stock')) return [{ affectedRows: 1 }]
      return [[]]
    },
    getConnection: async () => ({
      beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
      execute: async (sql: string, params: any[] = []) => pool().execute(sql, params),
    }),
  }
}

process.env.JWT_SECRET = 'gere_uma_chave_segura_de_32_caracteres_aqui'
import { catalogRoutes } from '../src/modules/catalog/catalog.routes'
import { errorHandler } from '../src/shared/errors/errorhandler'

function buildApp() {
  const app = Fastify()
  app.setErrorHandler(errorHandler)
  app.register(catalogRoutes, { prefix: '/api/public' })
  return app
}

const BASE_PAYLOAD = {
  items: [{ productId: 1, quantity: 1, price: 85 }],
  total: 85,
  paymentMethod: 'pagarme',
}

describe('Fix 422 — phone vazio/curto no checkout Pagar.me', () => {
  beforeEach(() => { orders = [] })

  it('1. Telefone VAZIO (cliente sem fone no perfil) → 201, pedido criado, gateway chamado', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/store/confeitaria-do-jony/checkout/pagarme',
      payload: { ...BASE_PAYLOAD, customer: { name: 'Maria Silva', phone: '' } },
    })
    expect(res.statusCode).toBe(201)
    expect(orders.length).toBe(1)
    expect(JSON.parse(res.body).data.url).toContain('pagar.me')
  })

  it('2. Telefone CURTO (4 dígitos) → 201, pedido criado (gateway usa fallback)', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/store/confeitaria-do-jony/checkout/pagarme',
      payload: { ...BASE_PAYLOAD, customer: { name: 'João Santos', phone: '1199' } },
    })
    expect(res.statusCode).toBe(201)
    expect(orders.length).toBe(1)
  })

  it('3. Telefone FORMATADO com parênteses/traço → 201 (sempre funcionou)', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/store/confeitaria-do-jony/checkout/pagarme',
      payload: { ...BASE_PAYLOAD, customer: { name: 'Diego Teste', phone: '(11) 98765-4321', email: 'diego@teste.com' } },
    })
    expect(res.statusCode).toBe(201)
    expect(orders.length).toBe(1)
  })

  it('4. Telefone com DDI +55 → 201, gateway usa areaCode extraído corretamente', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/store/confeitaria-do-jony/checkout/pagarme',
      payload: { ...BASE_PAYLOAD, customer: { name: 'Ana Oliveira', phone: '5511988887777' } },
    })
    expect(res.statusCode).toBe(201)
    expect(orders.length).toBe(1)
  })

  it('5. Sem campo phone no payload → 201, phone recebe default vazio', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/store/confeitaria-do-jony/checkout/pagarme',
      payload: { ...BASE_PAYLOAD, customer: { name: 'Visitante' } },
    })
    expect(res.statusCode).toBe(201)
  })

  it('6. Nome com menos de 2 chars → 422 (validação legítima permanece)', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/store/confeitaria-do-jony/checkout/pagarme',
      payload: { ...BASE_PAYLOAD, customer: { name: 'A', phone: '11999999999' } },
    })
    expect(res.statusCode).toBe(422)
    expect(orders.length).toBe(0) // nenhum pedido criado
  })
})
