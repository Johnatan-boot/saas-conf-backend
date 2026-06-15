// ============================================================
// customer-auth.routes.ts
//
// Registrado com prefix '/api/public' (igual catalogRoutes).
// /api/public/store/:slug/auth/register
// /api/public/store/:slug/auth/login
// /api/public/store/:slug/profile        (autenticado)
// /api/public/store/:slug/my-orders      (autenticado)
// ============================================================
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { customerAuthMiddleware } from './customer-auth.middleware'
import {
  registerCustomerService, loginCustomerService,
  getCustomerProfileService, updateCustomerProfileService, getMyOrdersService,
} from './customer-auth.service'

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const profileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  newPassword: z.string().min(6).optional(),
})

// ⚠️ Type assertions abaixo: o zod 3.25 instalado neste ambiente
// infere `z.infer<...>` com todos os campos opcionais mesmo sem
// `.optional()`. Em runtime o `.parse()` continua validando
// corretamente (lança erro se faltar campo obrigatório) — as
// interfaces abaixo refletem essa garantia para o TypeScript.
interface RegisterBody { name: string; email: string; password: string; phone?: string }
interface LoginBody { email: string; password: string }
interface ProfileBody { name?: string; email?: string; phone?: string; address?: string; newPassword?: string }

export async function customerAuthRoutes(app: FastifyInstance) {
  // POST /store/:slug/auth/register
  app.post('/store/:slug/auth/register', async (req, rep) => {
    const { slug } = req.params as any
    const body = registerSchema.parse(req.body) as RegisterBody
    const result = await registerCustomerService(slug, body)
    return rep.status(201).send({ success: true, data: result })
  })

  // POST /store/:slug/auth/login
  app.post('/store/:slug/auth/login', async (req, rep) => {
    const { slug } = req.params as any
    const { email, password } = loginSchema.parse(req.body) as LoginBody
    const result = await loginCustomerService(slug, email, password)
    return rep.send({ success: true, data: result })
  })

  // GET /store/:slug/profile
  app.get('/store/:slug/profile', { preHandler: customerAuthMiddleware }, async (req: any, rep) => {
    const data = await getCustomerProfileService(req.tenantId, req.clientId)
    return rep.send({ success: true, data })
  })

  // PUT /store/:slug/profile
  app.put('/store/:slug/profile', { preHandler: customerAuthMiddleware }, async (req: any, rep) => {
    const body = profileSchema.parse(req.body) as ProfileBody
    const data = await updateCustomerProfileService(req.tenantId, req.clientId, body)
    return rep.send({ success: true, data })
  })

  // GET /store/:slug/my-orders
  app.get('/store/:slug/my-orders', { preHandler: customerAuthMiddleware }, async (req: any, rep) => {
    const data = await getMyOrdersService(req.tenantId, req.clientId)
    return rep.send({ success: true, data })
  })
}
