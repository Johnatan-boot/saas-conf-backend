import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { env } from '../config/env'
import { errorHandler } from '../shared/errors/errorhandler'

import { authRoutes } from '../modules/auth/auth.routes'
import { tenantRoutes } from '../modules/tenants/tenants.routes'
import { userRoutes } from '../modules/users/user.routes'
import { clientRoutes } from '../modules/clients/client.routes'
import { productRoutes } from '../modules/products/product.routes'
import { orderRoutes } from '../modules/orders/order.routes'
import { paymentRoutes } from '../modules/payments/payment.routes'
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes'
import { auditRoutes } from '../modules/audit/audit.routes'
import { healthRoutes } from '../modules/health/health.routes'
import { telegramRoutes } from '../modules/telegram/telegram.routes'

export const buildApp = () => {
  const app = Fastify({
    logger: {
      level: env.isProd ? 'warn' : 'info',
      transport: env.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
    },
  })

  // Plugins globais
  app.register(cors, {
    origin: [env.frontendUrl, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  })

  app.register(jwt, { secret: env.jwtSecret })

  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Muitas requisições. Tente novamente em alguns segundos.',
    }),
  })

  // Rotas
  app.register(healthRoutes, { prefix: '/health' })
  app.register(authRoutes,    { prefix: '/api/auth' })
  app.register(tenantRoutes,  { prefix: '/api/tenants' })
  app.register(userRoutes,    { prefix: '/api/users' })
  app.register(clientRoutes,  { prefix: '/api/clients' })
  app.register(productRoutes, { prefix: '/api/products' })
  app.register(orderRoutes,   { prefix: '/api/orders' })
  app.register(paymentRoutes, { prefix: '/api/payments' })
  app.register(dashboardRoutes,{ prefix: '/api/dashboard' })
  app.register(auditRoutes,   { prefix: '/api/audit' })
  app.register(telegramRoutes, { prefix: '/api/telegram' })

  // Rota raiz
  app.get('/', async () => ({
    name: 'SaaS Confeitaria API',
    version: '2.0.0',
    status: 'running',
    docs: '/health',
  }))

  // Error handler global
  app.setErrorHandler(errorHandler)

  return app
}
