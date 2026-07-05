import { FastifyInstance } from 'fastify'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { loginController, registerController, refreshController, logoutController, meController } from './auth.controller'

export async function authRoutes(app: FastifyInstance) {
  // Login e register precisam do tenant no header
  app.register(async (tenantScopedRoutes) => {
    tenantScopedRoutes.addHook('preHandler', tenantMiddleware)
    tenantScopedRoutes.post('/login', loginController)
    tenantScopedRoutes.post('/register', registerController)
  })

  // Login do Super Admin — sem slug obrigatório (usa tenant_id=1 implicitamente)
  app.post('/superadmin/login', async (req, rep) => {
    const { email, password } = req.body as any
    if (!email || !password) return rep.status(400).send({ success: false, error: 'Email e senha obrigatórios' })
    const { loginService } = await import('./auth.service')
    const { db } = await import('../../database/connection')
    // Busca o usuário com role=super_admin independente de tenant
    const [rows]: any = await db.execute(
      `SELECT * FROM users WHERE email=? AND role='super_admin' AND deleted_at IS NULL LIMIT 1`,
      [email]
    )
    if (!rows || rows.length === 0) return rep.status(401).send({ success: false, error: 'Credenciais inválidas' })
    const result = await loginService(rows[0].tenant_id, email, password)
    return rep.send({ success: true, data: result })
  })

  // Refresh/logout/me usam apenas o JWT — sem header de tenant
  app.post('/refresh', refreshController)
  app.post('/logout', { preHandler: [authMiddleware] }, logoutController)
  app.get('/me', { preHandler: [authMiddleware] }, meController)
}