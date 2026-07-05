// ============================================================
// superadmin.routes.ts — /api/superadmin/*
//
// Endpoints cross-tenant protegidos por superAdminMiddleware.
// Apenas usuários com role='super_admin' conseguem acessar.
// ============================================================
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { superAdminMiddleware } from './superadmin.middleware'
import {
  getAllTenants, getTenantById, updateTenantPlan,
  getAllSubscriptions, createSubscription, updateSubscriptionStatus,
  getRevenueSummary, PLAN_PRICES, CYCLE_MONTHS,
} from './superadmin.repository'
import { hashPassword } from '../../shared/utils/hash'
import { db } from '../../database/connection'

export async function superAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', superAdminMiddleware)

  // ── Painel de receita ─────────────────────────────────────────────────
  app.get('/revenue', async (_req, rep) => {
    const data = await getRevenueSummary()
    return rep.send({ success: true, data })
  })

  // ── Tenants ───────────────────────────────────────────────────────────
  app.get('/tenants', async (_req, rep) => {
    const data = await getAllTenants()
    return rep.send({ success: true, data })
  })

  app.get('/tenants/:id', async (req, rep) => {
    const { id } = req.params as any
    const data = await getTenantById(Number(id))
    if (!data) return rep.status(404).send({ success: false, error: 'Tenant não encontrado' })
    return rep.send({ success: true, data })
  })

  app.put('/tenants/:id/plan', async (req, rep) => {
    const { id } = req.params as any
    const schema = z.object({
      plan: z.enum(['economico', 'standard', 'premium']),
      plan_status: z.enum(['active', 'trial', 'overdue', 'suspended', 'cancelled']).default('active'),
    })
    const body = schema.parse(req.body) as any
    await updateTenantPlan(Number(id), body.plan, body.plan_status)
    return rep.send({ success: true, message: `Plano atualizado para ${body.plan}` })
  })

  app.put('/tenants/:id/status', async (req, rep) => {
    const { id } = req.params as any
    const { status } = req.body as any
    if (!['active', 'trial', 'overdue', 'suspended', 'cancelled'].includes(status)) {
      return rep.status(400).send({ success: false, error: 'Status inválido' })
    }
    await db.execute('UPDATE tenants SET plan_status=?, updated_at=NOW() WHERE id=?', [status, id])
    return rep.send({ success: true })
  })

  // ── Subscriptions ─────────────────────────────────────────────────────
  app.get('/subscriptions', async (_req, rep) => {
    const data = await getAllSubscriptions()
    return rep.send({ success: true, data })
  })

  app.post('/subscriptions', async (req, rep) => {
    const schema = z.object({
      tenantId:     z.number(),
      plan:         z.enum(['economico', 'standard', 'premium']),
      billingCycle: z.enum(['mensal', '12x', '24x', '36x']).default('mensal'),
      startedAt:    z.string().default(new Date().toISOString().split('T')[0]),
      notes:        z.string().optional(),
    })
    const body = schema.parse(req.body) as any

    // Calcula preço com desconto por ciclo
    const basePrice = PLAN_PRICES[body.plan]
    const months    = CYCLE_MONTHS[body.billingCycle]
    const discount  = months >= 36 ? 0.80 : months >= 24 ? 0.85 : months >= 12 ? 0.90 : 1.0
    const pricePerMonth = Number((basePrice * discount).toFixed(2))

    // Calcula data de expiração
    const started = new Date(body.startedAt)
    const expires = new Date(started)
    expires.setMonth(expires.getMonth() + months)

    const id = await createSubscription({
      ...body,
      pricePerMonth,
      totalMonths: months,
      expiresAt: months > 1 ? expires.toISOString().split('T')[0] : null,
    })

    // Atualiza o plano do tenant automaticamente
    await updateTenantPlan(body.tenantId, body.plan, 'active')

    return rep.status(201).send({ success: true, data: { id, pricePerMonth, totalMonths: months } })
  })

  app.patch('/subscriptions/:id/status', async (req, rep) => {
    const { id } = req.params as any
    const { status } = req.body as any
    await updateSubscriptionStatus(Number(id), status)
    return rep.send({ success: true })
  })

  // ── Criar super_admin via API (setup inicial) ─────────────────────────
  app.post('/setup', async (req, rep) => {
    const setupKey = req.headers['x-setup-key']
    if (setupKey !== process.env.SUPERADMIN_SETUP_KEY) {
      return rep.status(403).send({ success: false, error: 'Chave de setup inválida' })
    }
    const schema = z.object({
      name:     z.string().min(2),
      email:    z.string().email(),
      password: z.string().min(8),
    })
    const { name, email, password } = schema.parse(req.body)
    const hash = await hashPassword(password)
    const [existing]: any = await db.execute('SELECT id FROM users WHERE email=?', [email])
    if (existing.length > 0) {
      await db.execute('UPDATE users SET password_hash=?, role=?, name=? WHERE email=?', [hash, 'super_admin', name, email])
      return rep.send({ success: true, message: 'Super admin atualizado' })
    }
    await db.execute(
      'INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES (1,?,?,?,?)',
      [name, email, hash, 'super_admin']
    )
    return rep.status(201).send({ success: true, message: 'Super admin criado' })
  })
}
