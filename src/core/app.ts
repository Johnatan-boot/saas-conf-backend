import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { env } from '../config/env'
import { errorHandler } from '../shared/errors/errorhandler'

import { authRoutes }      from '../modules/auth/auth.routes'
import { tenantRoutes }    from '../modules/tenants/tenants.routes'
import { userRoutes }      from '../modules/users/user.routes'
import { clientRoutes }    from '../modules/clients/client.routes'
import { productRoutes }   from '../modules/products/product.routes'
import { orderRoutes }     from '../modules/orders/order.routes'
import { paymentRoutes }   from '../modules/payments/payment.routes'
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes'
import { auditRoutes }     from '../modules/audit/audit.routes'
import { healthRoutes }    from '../modules/health/health.routes'
import { telegramRoutes }  from '../modules/telegram/telegram.routes'

export const buildApp = () => {
  const app = Fastify({
    logger: {
      level: env.isProd ? 'warn' : 'info',
      transport: env.isProd
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true } },
    },
  })

  // CORS — aceita qualquer origem onrender.com + localhost
  app.register(cors, {
    origin: (origin, cb) => {
      // Sem origin = Postman, curl, server-to-server
      if (!origin) return cb(null, true)

      const allowed =
        origin.includes('onrender.com') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin === env.frontendUrl

      if (allowed) {
        cb(null, true)
      } else {
        console.warn(`[CORS] Bloqueado: ${origin}`)
        cb(null, false)
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug'],
  })

  app.register(jwt, { secret: env.jwtSecret })

  app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Muitas requisições. Tente novamente em alguns segundos.',
    }),
  })

  // Rotas
  app.register(healthRoutes,    { prefix: '/health' })
  app.register(authRoutes,      { prefix: '/api/auth' })
  app.register(tenantRoutes,    { prefix: '/api/tenants' })
  app.register(userRoutes,      { prefix: '/api/users' })
  app.register(clientRoutes,    { prefix: '/api/clients' })
  app.register(productRoutes,   { prefix: '/api/products' })
  app.register(orderRoutes,     { prefix: '/api/orders' })
  app.register(paymentRoutes,   { prefix: '/api/payments' })
  app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  app.register(auditRoutes,     { prefix: '/api/audit' })
  app.register(telegramRoutes,  { prefix: '/api/telegram' })

  // Health check raiz
  app.get('/', async () => ({
    name: 'SaaS Confeitaria API',
    version: '2.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  }))

  app.setErrorHandler(errorHandler)

  return app
}
