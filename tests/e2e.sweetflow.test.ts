import { describe, it, expect, beforeAll, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'

// ============================================================
// "Banco" em memória — schema reduzido das tabelas que entram
// na jornada (tenants, store_themes, products, clients, orders,
// order_items). Cobre as migrations 001-008 já aplicadas.
// ============================================================
const DB = {
  tenant: { id: 2, name: 'Confeitaria do Jony', slug: 'confeitaria-do-jony', plan: 'free', plan_status: 'active' },
  theme: {
    tenant_id: 2, primary_color: '#7219c7', secondary_color: '#f5c842', background_color: '#f7f0ff',
    text_color: '#2d0850', card_color: '#ffffff', logo_url: '', banner_url: 'data:image/jpeg;base64,BANNER',
    store_name: 'Confeitaria do Jony', tagline: 'Doces momentos que ficam na memória',
    about_text: 'Desde 2018 fazemos bolos artesanais com muito carinho.',
    slug: 'confeitaria-do-jony', address: 'Rua das Flores, 123 - Centro',
    instagram: '', facebook: '', whatsapp: '5511999999999', youtube: '', updated_at: new Date().toISOString(),
  },
  products: [] as any[],
  clients: [] as any[],
  orders: [] as any[],
  order_items: [] as any[],
}
let nextProductId = 1, nextClientId = 1, nextOrderId = 1

const tight = (s: string) => s.replace(/\s+/g, '').toLowerCase()

// Aplica "UPDATE tabela SET col1=?, col2=? WHERE ..." genericamente,
// extraindo nomes das colunas via regex e casando com os params.
function genericUpdate(rows: any[], sql: string, params: any[], whereCount: number) {
  const setPart = sql.split(/set/i)[1].split(/where/i)[0]
  const cols = [...setPart.matchAll(/(\w+)\s*=\s*\?/g)].map(m => m[1])
  const setVals = params.slice(0, cols.length)
  const whereVals = params.slice(cols.length, cols.length + whereCount)
  const row = rows.find(r => whereVals.every((v, i) => i === 0 ? r.id === v : r.tenant_id === v))
  if (row) cols.forEach((c, i) => { row[c] = setVals[i] })
  return row
}

vi.mock('mysql2/promise', () => ({ default: { createPool: () => pool() }, createPool: () => pool() }))
vi.mock('../src/shared/utils/hash', () => ({
  hashPassword: async (p: string) => `H(${p})`,
  comparePassword: async (p: string, h: string) => h === `H(${p})`,
}))
vi.mock('../src/shared/webhooks/zapier', () => ({ triggerZapier: vi.fn(() => Promise.resolve()), ZapierEvents: { NEW_ORDER: 'new_order', ORDER_STATUS_CHANGED: 'status' } }))
vi.mock('../src/modules/telegram/telegram.bot', () => ({ notifyAllSessions: vi.fn(() => Promise.resolve()) }))
vi.mock('../src/modules/payments/gateway.service', () => ({
  gatewayStatus: () => ({ stripe: 'ok', mercadopago_at: 'ok', pagarme: 'ok' }),
  createStripeSession: vi.fn(async () => ({ url: 'https://checkout.stripe.com/e2e-session' })),
  createMercadoPagoPreference: vi.fn(async () => ({ url: 'https://mp.com/e2e' })),
  createPagarmeCheckout: vi.fn(async () => ({ url: 'https://pagar.me/e2e' })),
}))

function pool() {
  return {
    execute: async (sqlRaw: string, params: any[] = []) => runQuery(sqlRaw, params),
    getConnection: async () => ({
      beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
      execute: async (sql: string, params: any[] = []) => runQuery(sql, params),
    }),
  }
}

async function runQuery(sqlRaw: string, params: any[] = []) {
      const q = tight(sqlRaw)

      // ---- tenants ----
      if (q.startsWith('selectid,name,slug,plan,plan_statusfromtenantswheredeleted_atisnulland')) {
        return q.includes('slug=?')
          ? [params[0] === DB.tenant.slug ? [DB.tenant] : []]
          : [params[0] === DB.tenant.id ? [DB.tenant] : []]
      }

      // ---- store_themes ----
      if (q.startsWith('selecttenant_idfromstore_themeswhereslug=?')) {
        return [params[0] === DB.theme.slug ? [{ tenant_id: DB.theme.tenant_id }] : []]
      }
      if (q.startsWith('selectprimary_color')) {
        if (params[0] !== DB.theme.slug) return [[]]
        return [[{
          primaryColor: DB.theme.primary_color, secondaryColor: DB.theme.secondary_color,
          backgroundColor: DB.theme.background_color, textColor: DB.theme.text_color,
          cardColor: DB.theme.card_color, logoUrl: DB.theme.logo_url, bannerUrl: DB.theme.banner_url,
          storeName: DB.theme.store_name, tagline: DB.theme.tagline, aboutText: DB.theme.about_text,
          slug: DB.theme.slug, address: DB.theme.address,
          instagram: DB.theme.instagram, facebook: DB.theme.facebook, whatsapp: DB.theme.whatsapp, youtube: DB.theme.youtube,
        }]]
      }

      // ---- clients ----
      if (q.startsWith('select*fromclientswheretenant_id=?andemail=?')) {
        const c = DB.clients.find(c => c.tenant_id === params[0] && c.email === params[1] && !c.deleted_at)
        return [c ? [c] : []]
      }
      if (q.startsWith('select*fromclientswhereid=?andtenant_id=?')) {
        const c = DB.clients.find(c => c.id === params[0] && c.tenant_id === params[1] && !c.deleted_at)
        return [c ? [c] : []]
      }
      if (q.startsWith('select*fromclientswheretenant_id=?anddeleted_atisnull')) {
        const list = DB.clients.filter(c => c.tenant_id === params[0] && !c.deleted_at)
        return [list]
      }
      if (q.startsWith('insertintoclients(tenant_id,name,email,phone,password_hash)')) {
        const c = { id: nextClientId++, tenant_id: params[0], name: params[1], email: params[2], phone: params[3], password_hash: params[4], address: null, total_orders: 0, total_spent: 0, deleted_at: null }
        DB.clients.push(c)
        return [{ insertId: c.id }]
      }
      if (q.startsWith('insertintoclients(tenant_id,name,email,phone,birthday,address,notes)')) {
        const c = { id: nextClientId++, tenant_id: params[0], name: params[1], email: params[2], phone: params[3], birthday: params[4], address: params[5], notes: params[6], total_orders: 0, total_spent: 0, deleted_at: null }
        DB.clients.push(c)
        return [{ insertId: c.id }]
      }
      if (q.startsWith('updateclientscset')) {
        const id = params[0]
        const c = DB.clients.find(c => c.id === id)
        if (c) {
          c.total_orders = DB.orders.filter(o => o.client_id === id).length
          c.total_spent = DB.orders.filter(o => o.client_id === id && o.status !== 'cancelled').reduce((s, o) => s + Number(o.total), 0)
        }
        return [{ affectedRows: 1 }]
      }
      if (q.startsWith('updateclientsset')) {
        const hasTenant = q.includes('andtenant_id=?')
        genericUpdate(DB.clients, sqlRaw, params, hasTenant ? 2 : 1)
        return [{ affectedRows: 1 }]
      }

      // ---- products ----
      if (q.startsWith('selectid,stockfromproductswhereid=?andtenant_id=?')) {
        const p = DB.products.find(p => p.id === params[0] && p.tenant_id === params[1])
        return [p ? [{ id: p.id, stock: p.stock }] : []]
      }
      if (q.startsWith('selectnamefromproductswhereid=?')) {
        const p = DB.products.find(p => p.id === params[0])
        return [[{ name: p?.name || '' }]]
      }
      if (q.startsWith('select*fromproductswhereid=?andtenant_id=?')) {
        const p = DB.products.find(p => p.id === params[0] && p.tenant_id === params[1] && !p.deleted_at)
        return [p ? [p] : []]
      }
      if (q.startsWith('selectp.*,c.nameascategory_namefromproductsp')) {
        const list = DB.products.filter(p => p.tenant_id === params[0] && !p.deleted_at)
        return [list]
      }
      if (q.startsWith('insertintoproducts(tenant_id,name,description,price,cost_price,unit,stock,min_stock,category_id,image_url)')) {
        const p = { id: nextProductId++, tenant_id: params[0], name: params[1], description: params[2], price: params[3], cost_price: params[4], unit: params[5], stock: params[6], min_stock: params[7], category_id: params[8], image_url: params[9], is_active: 1, deleted_at: null }
        DB.products.push(p)
        return [{ insertId: p.id }]
      }
      if (q.startsWith('updateproductssetstock=stock-?')) {
        const p = DB.products.find(p => p.id === params[1] && p.tenant_id === params[2])
        if (p) p.stock -= params[0]
        return [{ affectedRows: 1 }]
      }
      if (q.startsWith('updateproductssetstock=stock+?')) {
        const p = DB.products.find(p => p.id === params[1] && p.tenant_id === params[2])
        if (p) p.stock += params[0]
        return [{ affectedRows: 1 }]
      }
      if (q.startsWith('updateproductsset')) {
        genericUpdate(DB.products, sqlRaw, params, 2)
        return [{ affectedRows: 1 }]
      }
      if (q.startsWith('selectp.id,p.name,p.description,p.price')) {
        const list = DB.products.filter(p => p.tenant_id === params[0] && p.stock > 0 && p.is_active && !p.deleted_at)
          .map(p => ({ id: p.id, name: p.name, description: p.description, price: p.price, imageUrl: p.image_url, category: null, stock: p.stock }))
        return [list]
      }

      // ---- orders / order_items ----
      if (q.startsWith('insertintoorders(tenant_id,client_id,code,status,delivery_type,subtotal,discount,total,notes,payment_method,created_at)')) {
        const o = { id: nextOrderId++, tenant_id: params[0], client_id: params[1], code: params[2], status: 'pending', delivery_type: 'pickup', subtotal: params[3], total: params[4], notes: params[5], payment_method: params[6], created_at: new Date().toISOString() }
        DB.orders.push(o)
        return [{ insertId: o.id }]
      }
      if (q.startsWith('insertintoorders(tenant_id,client_id,user_id,code,status,delivery_date,delivery_type,delivery_address,subtotal,discount,total,notes)')) {
        const code = `PED-${nextOrderId}`
        const o = { id: nextOrderId++, tenant_id: params[0], client_id: params[1], user_id: params[2], code, status: params[4] || 'pending', delivery_date: params[5], delivery_type: params[6] || 'pickup', delivery_address: params[7], subtotal: params[8], discount: params[9], total: params[10], notes: params[11], payment_method: null, created_at: new Date().toISOString() }
        DB.orders.push(o)
        return [{ insertId: o.id }]
      }
      if (q.startsWith('insertintoorder_items(order_id,product_id,product_name,quantity,unit_price,total_price)') && !q.includes(',notes)')) {
        DB.order_items.push({ order_id: params[0], product_id: params[1], product_name: params[2], quantity: params[3], unit_price: params[4], total_price: params[5] })
        return [{ insertId: DB.order_items.length }]
      }
      if (q.startsWith('insertintoorder_items(order_id,product_id,product_name,quantity,unit_price,total_price,notes)')) {
        DB.order_items.push({ order_id: params[0], product_id: params[1], product_name: params[2], quantity: params[3], unit_price: params[4], total_price: params[5], notes: params[6] })
        return [{ insertId: DB.order_items.length }]
      }
      if (q.startsWith('updateorderssetstatus=?')) {
        const o = DB.orders.find(o => o.id === params[1] && o.tenant_id === params[2])
        if (o) o.status = params[0]
        return [{ affectedRows: 1 }]
      }
      if (q.startsWith('selecto.*,c.nameasclient_namefromordersoleftjoinclientsconc.id=o.client_idwhereo.id=?')) {
        const o = DB.orders.find(o => o.id === params[0] && o.tenant_id === params[1])
        if (!o) return [[]]
        const c = DB.clients.find(c => c.id === o.client_id)
        return [[{ ...o, client_name: c?.name || null }]]
      }
      if (q.startsWith('selectoi.*,p.image_urlfromorder_itemsoileftjoinproductsponp.id=oi.product_idwhereoi.order_id=?')) {
        return [DB.order_items.filter(i => i.order_id === params[0]).map(i => ({ ...i, image_url: null }))]
      }
      if (q.startsWith('selecto.*,c.nameasclient_name,u.nameasuser_namefromorders')) {
        const list = DB.orders.filter(o => o.tenant_id === params[0])
          .map(o => ({ ...o, client_name: DB.clients.find(c => c.id === o.client_id)?.name || null, user_name: null }))
        return [list]
      }
      if (q.startsWith('selectid,code,status,total,delivery_type,created_atfromorderswheretenant_id=?andclient_id=?')) {
        const list = DB.orders.filter(o => o.tenant_id === params[0] && o.client_id === params[1])
        return [list]
      }
      if (q.startsWith('selectorder_id,product_name,quantity,unit_price,total_pricefromorder_itemswhereorder_idin(')) {
        return [DB.order_items.filter(i => params.includes(i.order_id))]
      }

      // ---- dashboard ----
      if (q.startsWith('selectcoalesce(sum(total),0)astotal,coalesce(sum(total),0)asmonthfromorders')) {
        const sum = DB.orders.filter(o => o.tenant_id === params[0] && o.status === 'delivered').reduce((s, o) => s + Number(o.total), 0)
        return [[{ total: sum, month: sum }]]
      }
      if (q.startsWith('selectcount(*)astotal,sum(status=')) {
        const list = DB.orders.filter(o => o.tenant_id === params[0])
        return [[{
          total: list.length,
          pending: list.filter(o => o.status === 'pending').length,
          in_production: list.filter(o => o.status === 'in_production').length,
          delivered: list.filter(o => o.status === 'delivered').length,
          cancelled: list.filter(o => o.status === 'cancelled').length,
        }]]
      }
      if (q.startsWith('selectcount(*)astotalfromclientswheretenant_id=?anddeleted_atisnull')) {
        return [[{ total: DB.clients.filter(c => c.tenant_id === params[0] && !c.deleted_at).length }]]
      }
      if (q.startsWith('selectcount(*)astotal,sum(stock<=min_stockandis_active=1)aslow_stockfromproducts')) {
        const list = DB.products.filter(p => p.tenant_id === params[0] && !p.deleted_at)
        return [[{ total: list.length, low_stock: list.filter(p => p.stock <= p.min_stock && p.is_active).length }]]
      }

      throw new Error('Query não mockada: ' + sqlRaw)
}

process.env.JWT_SECRET = 'dev_secret_change_in_production_32chars'

import { catalogRoutes } from '../src/modules/catalog/catalog.routes'
import { customerAuthRoutes } from '../src/modules/customer-auth/customer-auth.routes'
import { checkoutRoutes } from '../src/modules/payments/checkout.routes'
import { productRoutes } from '../src/modules/products/product.routes'
import { clientRoutes } from '../src/modules/clients/client.routes'
import { orderRoutes } from '../src/modules/orders/order.routes'
import { dashboardRoutes } from '../src/modules/dashboard/dashboard.routes'
import { tenantMiddleware } from '../src/middlewares/tenant.middleware'
import { authMiddleware } from '../src/middlewares/auth.middleware'
import { errorHandler } from '../src/shared/errors/errorhandler'

function buildApp(): FastifyInstance {
  const app = Fastify()
  app.setErrorHandler(errorHandler)
  // públicas
  app.register(catalogRoutes, { prefix: '/api/public' })
  app.register(customerAuthRoutes, { prefix: '/api/public' })
  // admin (tenant + auth)
  app.register(async (i) => {
    i.addHook('preHandler', tenantMiddleware)
    i.addHook('preHandler', authMiddleware)
    i.register(productRoutes, { prefix: '/api/products' })
    i.register(clientRoutes, { prefix: '/api/clients' })
    i.register(orderRoutes, { prefix: '/api/orders' })
    i.register(dashboardRoutes, { prefix: '/api/dashboard' })
    i.register(checkoutRoutes, { prefix: '/api/checkout' })
  })
  return app
}

const SLUG = 'confeitaria-do-jony'
const staffToken = jwt.sign({ userId: 1, tenantId: DB.tenant.id, role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1d' })
const staffHeaders = { authorization: `Bearer ${staffToken}`, 'x-tenant-slug': SLUG, 'content-type': 'application/json' }

let productAId: number, productBId: number
let customerToken: string, customerId: number
let catalogOrderCode: string, gatewayOrderCode: string
let adminOrderId: number

describe('E2E — Jornada completa SweetFlow (Entregas 1+2 + auditorias)', () => {
  const app = buildApp()

  it('1. Catálogo público reflete Design da Loja (Entrega 1: banner/sobre/contato)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/public/store/${SLUG}` })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.body).data
    expect(data.bannerUrl).toContain('BANNER')
    expect(data.aboutText).toContain('2018')
    expect(data.address).toContain('Rua das Flores')
  })

  it('2. Admin cadastra 2 produtos (entram no estoque)', async () => {
    const r1 = await app.inject({ method: 'POST', url: '/api/products', headers: staffHeaders, payload: { name: 'Bolo de Cenoura', price: 60, cost_price: 25, stock: 10, min_stock: 2 } })
    const r2 = await app.inject({ method: 'POST', url: '/api/products', headers: staffHeaders, payload: { name: 'Brigadeiro Gourmet', price: 5, cost_price: 1.5, stock: 50, min_stock: 10 } })
    expect(r1.statusCode).toBe(201); expect(r2.statusCode).toBe(201)
    productAId = JSON.parse(r1.body).data.id
    productBId = JSON.parse(r2.body).data.id
    expect(DB.products.length).toBe(2)
  })

  it('3. Produtos cadastrados aparecem no catálogo público E na Precificação (GET /products)', async () => {
    const catalog = await app.inject({ method: 'GET', url: `/api/public/store/${SLUG}/products` })
    const catalogNames = JSON.parse(catalog.body).data.map((p: any) => p.name)
    expect(catalogNames).toEqual(expect.arrayContaining(['Bolo de Cenoura', 'Brigadeiro Gourmet']))

    // Mesmo endpoint que o PricingPage usa pra listar os botões de produto
    const admin = await app.inject({ method: 'GET', url: '/api/products', headers: staffHeaders })
    const adminProducts = JSON.parse(admin.body).data
    expect(adminProducts.find((p: any) => p.id === productAId).cost_price).toBe(25)
  })

  it('4. Dashboard reflete os 2 produtos cadastrados (kpis.products.total)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/kpis', headers: staffHeaders })
    const kpis = JSON.parse(res.body).data
    expect(kpis.products.total).toBe(2)
    expect(kpis.clients.total).toBe(0)
  })

  it('5. Cliente final cria conta no catálogo (Entrega 2) -> aparece em /clientes', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/public/store/${SLUG}/auth/register`,
      payload: { name: 'Mariana Souza', email: 'mariana@cliente.com', password: 'senha123', phone: '5511988887777' },
    })
    expect(res.statusCode).toBe(201)
    customerToken = JSON.parse(res.body).data.accessToken
    customerId = JSON.parse(res.body).data.client.id

    const clientsRes = await app.inject({ method: 'GET', url: '/api/clients', headers: staffHeaders })
    const clients = JSON.parse(clientsRes.body).data
    expect(clients.find((c: any) => c.email === 'mariana@cliente.com')).toBeTruthy()

    const kpis = await app.inject({ method: 'GET', url: '/api/dashboard/kpis', headers: staffHeaders })
    expect(JSON.parse(kpis.body).data.clients.total).toBe(1)
  })

  it('6. Cliente LOGADO faz pedido via PIX no catálogo -> client_id vinculado, estoque deduz', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/public/store/${SLUG}/orders`,
      headers: { authorization: `Bearer ${customerToken}`, 'content-type': 'application/json' },
      payload: {
        customer: { name: 'Mariana Souza', phone: '5511988887777', email: 'mariana@cliente.com' },
        items: [{ productId: productAId, quantity: 1, price: 60 }],
        total: 60, paymentMethod: 'pix',
      },
    })
    expect(res.statusCode).toBe(201)
    catalogOrderCode = JSON.parse(res.body).data.code
    expect(catalogOrderCode).toMatch(/^CAT-/)

    const bolo = DB.products.find(p => p.id === productAId)
    expect(bolo.stock).toBe(9) // 10 - 1

    const order = DB.orders.find(o => o.code === catalogOrderCode)
    expect(order.client_id).toBe(customerId)
    expect(order.payment_method).toBe('pix')
  })

  it('7. "Meus Pedidos" do cliente mostra o pedido recém-feito', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/public/store/${SLUG}/my-orders`, headers: { authorization: `Bearer ${customerToken}` } })
    const list = JSON.parse(res.body).data
    expect(list.length).toBe(1)
    expect(list[0].code).toBe(catalogOrderCode)
    expect(list[0].items[0].productName).toBe('Bolo de Cenoura')
  })

  it('8. Mesmo cliente paga via Stripe (checkout fix) -> pedido criado ANTES do redirect, payment_method salvo', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/public/store/${SLUG}/checkout/stripe`,
      headers: { authorization: `Bearer ${customerToken}`, 'content-type': 'application/json' },
      payload: {
        customer: { name: 'Mariana Souza', phone: '5511988887777', email: 'mariana@cliente.com' },
        items: [{ productId: productBId, quantity: 10, price: 5 }],
        total: 50, paymentMethod: 'stripe',
      },
    })
    expect(res.statusCode).toBe(201)
    const data = JSON.parse(res.body).data
    expect(data.url).toBe('https://checkout.stripe.com/e2e-session')
    gatewayOrderCode = data.code

    const order = DB.orders.find(o => o.code === gatewayOrderCode)
    expect(order.client_id).toBe(customerId)
    expect(order.payment_method).toBe('stripe')
    expect(DB.products.find(p => p.id === productBId).stock).toBe(40) // 50 - 10
  })

  it('9. updateClientStats: total_orders/total_spent da Mariana refletem os 2 pedidos do catálogo', async () => {
    const c = DB.clients.find(c => c.id === customerId)
    expect(c.total_orders).toBe(2)
    expect(c.total_spent).toBe(110) // 60 + 50
  })

  it('10. Admin cria um 3º pedido (presencial) pra Mariana com Brigadeiro -> estoque deduz igual catálogo', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/orders', headers: staffHeaders,
      payload: { client_id: customerId, items: [{ product_id: productBId, quantity: 5 }] },
    })
    expect(res.statusCode).toBe(201)
    adminOrderId = JSON.parse(res.body).data.id
    expect(DB.products.find(p => p.id === productBId).stock).toBe(35) // 40 - 5

    const c = DB.clients.find(c => c.id === customerId)
    expect(c.total_orders).toBe(3)
    expect(c.total_spent).toBe(135) // 110 + 25 (5x R$5)
  })

  it('11. Dashboard: pedidos do mês contam os 3, mesmo de canais diferentes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/kpis', headers: staffHeaders })
    const kpis = JSON.parse(res.body).data
    expect(kpis.orders.total).toBe(3)
    expect(kpis.orders.pending).toBe(3)
  })

  it('12. Admin cancela o pedido presencial -> estoque do Brigadeiro volta (35 -> 40)', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/api/orders/${adminOrderId}/status`, headers: staffHeaders, payload: { status: 'cancelled' } })
    expect(res.statusCode).toBe(200)
    expect(DB.products.find(p => p.id === productBId).stock).toBe(40)

    const c = DB.clients.find(c => c.id === customerId)
    expect(c.total_orders).toBe(3) // contagem total inclui cancelado
    expect(c.total_spent).toBe(110) // mas total_spent EXCLUI cancelado (110, não 135)
  })

  it('13. Precificação: admin salva custo+preço recalculados de volta no produto', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/products/${productAId}`, headers: staffHeaders,
      payload: { cost_price: 28.5, price: 65 },
    })
    expect(res.statusCode).toBe(200)
    const updated = JSON.parse(res.body).data
    expect(updated.cost_price).toBe(28.5)
    expect(updated.price).toBe(65)

    // Catálogo público já reflete o novo preço
    const catalog = await app.inject({ method: 'GET', url: `/api/public/store/${SLUG}/products` })
    const bolo = JSON.parse(catalog.body).data.find((p: any) => p.id === productAId)
    expect(bolo.price).toBe(65)
  })

  it('14. Convidado (sem login) faz pedido via Mercado Pago -> registrado sem client_id', async () => {
    const before = DB.orders.length
    const res = await app.inject({
      method: 'POST', url: `/api/public/store/${SLUG}/checkout/mercadopago`,
      headers: { 'content-type': 'application/json' },
      payload: {
        customer: { name: 'Visitante', phone: '5511900000000' },
        items: [{ productId: productBId, quantity: 2, price: 5 }],
        total: 10, paymentMethod: 'mercadopago',
      },
    })
    expect(res.statusCode).toBe(201)
    expect(DB.orders.length).toBe(before + 1)
    expect(DB.orders[DB.orders.length - 1].client_id).toBeNull()
    expect(DB.orders[DB.orders.length - 1].payment_method).toBe('mercadopago')
  })

  it('15. Resumo final: KPIs do Dashboard fecham com a contagem real de pedidos/clientes/produtos', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/kpis', headers: staffHeaders })
    const kpis = JSON.parse(res.body).data
    expect(kpis.products.total).toBe(2)
    expect(kpis.clients.total).toBe(1)
    expect(kpis.orders.total).toBe(4) // 2 catálogo (Mariana) + 1 admin cancelado + 1 convidado
    expect(kpis.orders.cancelled).toBe(1)
  })
})
