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
import { themeRoutes }     from '../modules/theme/theme.routes'
import { catalogRoutes }   from '../modules/catalog/catalog.routes'
import { checkoutRoutes }  from '../modules/payments/checkout.routes'
import { ifoodRoutes }     from '../modules/integrations/ifood/ifood.routes'
import { categoryRoutes }  from '../modules/categories/category.routes'
import { customerAuthRoutes } from '../modules/customer-auth/customer-auth.routes'
import { superAdminRoutes }   from '../modules/superadmin/superadmin.routes'
import { subscriptionRoutes } from '../modules/subscriptions/subscription.routes'

export const buildApp = () => {
  const app = Fastify({
    // Logo da loja vai em base64 no corpo do PUT /api/settings/theme.
    // O padrão do Fastify (1 MiB) é insuficiente para fotos de celular
    // convertidas em base64 (~1.33x o tamanho do arquivo original).
    // 10 MiB cobre confortavelmente o limite de 2MB de arquivo definido
    // no frontend (DesignSettings.tsx).
    bodyLimit: 10 * 1024 * 1024,
    logger: {
      level: env.isProd ? 'warn' : 'info',
      transport: env.isProd
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true } },
    },
  })

  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      const allowed =
        origin.includes('onrender.com') || origin.includes('localhost') ||
        origin.includes('127.0.0.1') || origin === env.frontendUrl
      cb(null, !!allowed)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug'],
  })

  app.register(jwt, { secret: env.jwtSecret })
  app.register(rateLimit, {
    max: 200, timeWindow: '1 minute',
    errorResponseBuilder: () => ({ success: false, error: 'Muitas requisições. Aguarde.' }),
  })

  // Guarda o corpo bruto da requisição (Buffer) em request.rawBody.
  // Necessário para validar a assinatura do webhook do Stripe
  // (stripe.webhooks.constructEvent exige o payload exatamente como
  // veio na rede, sem passar pelo JSON.parse/stringify).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as any).rawBody = body
    if (!body || body.length === 0) return done(null, {})
    try {
      done(null, JSON.parse(body.toString('utf8')))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // Rotas existentes
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

  // Novos módulos (features anteriores)
  app.register(themeRoutes,    { prefix: '/api/settings/theme' })
  app.register(catalogRoutes,  { prefix: '/api/public' })
  app.register(customerAuthRoutes, { prefix: '/api/public' })
  app.register(checkoutRoutes, { prefix: '/api/checkout' })

  // ✅ Integrações: iFood (+ Keeta quando disponível)
  app.register(ifoodRoutes,    { prefix: '/api/integrations/ifood' })

  // ✅ Categorias de produtos
  app.register(categoryRoutes, { prefix: '/api/categories' })

  // ✅ Super Admin — gestão cross-tenant (role='super_admin' obrigatório)
  app.register(superAdminRoutes, { prefix: '/api/superadmin' })

  // ✅ Assinaturas do SaaS — checkout do próprio tenant + webhooks dos gateways
  app.register(subscriptionRoutes, { prefix: '/api/subscriptions' })

  app.get('/', async () => ({
    name: 'SaaS Confeitaria API', version: '2.0.0', status: 'running',
    timestamp: new Date().toISOString()
  }))

  app.setErrorHandler(errorHandler)
  return app
}
