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

  // Refresh/logout/me usam apenas o JWT — sem header de tenant
  app.post('/refresh', refreshController)
  app.post('/logout', { preHandler: [authMiddleware] }, logoutController)
  app.get('/me', { preHandler: [authMiddleware] }, meController)
}