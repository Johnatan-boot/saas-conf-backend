// ============================================================
// theme.routes.ts — Fastify, sem multer, sem tenant middleware
// Logo salva como base64/URL direto no campo logo_url
// ============================================================
import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { tenantMiddleware } from '../../middlewares/tenant.middleware'
import { getTheme, saveTheme } from './theme.service'

export async function themeRoutes(app: FastifyInstance) {
  // aplica os middlewares reais do projeto
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', authMiddleware)

  // GET /api/settings/theme
  app.get('/', async (req: any, rep) => {
    try {
      const data = await getTheme(req.tenantId)
      return rep.send({ success: true, data })
    } catch (err: any) {
      return rep.status(500).send({ success: false, error: err.message })
    }
  })

  // PUT /api/settings/theme  — salva tudo incluindo logoUrl (base64 ou URL)
  app.put('/', async (req: any, rep) => {
    try {
      const {
        primaryColor, secondaryColor, backgroundColor, textColor, cardColor,
        logoUrl, bannerUrl, storeName, tagline, aboutText, slug, address,
        instagram, facebook, whatsapp, youtube,
      } = req.body as any

      // Validações mínimas sem Zod (evita 422 do Fastify)
      if (slug && typeof slug === 'string') {
        const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
        if (clean !== slug) {
          return rep.status(400).send({ success: false, error: 'Slug inválido. Use apenas letras minúsculas, números e hífens.' })
        }
      }

      const data = await saveTheme(req.tenantId, {
        primaryColor, secondaryColor, backgroundColor, textColor, cardColor,
        logoUrl, bannerUrl, storeName, tagline, aboutText, slug, address,
        instagram, facebook, whatsapp, youtube,
      })
      return rep.send({ success: true, data })
    } catch (err: any) {
      const status = err.message?.includes('slug já está em uso') ? 409 : 500
      return rep.status(status).send({ success: false, error: err.message })
    }
  })
}
