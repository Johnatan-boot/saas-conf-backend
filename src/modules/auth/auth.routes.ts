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

  // Troca de senha autenticada (usuário logado)
  app.put('/change-password', { preHandler: [authMiddleware] }, async (req, rep) => {
    const { currentPassword, newPassword } = req.body as any
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return rep.status(400).send({ success: false, error: 'Senha atual e nova senha (mín. 6 chars) são obrigatórias' })
    }
    const { db } = await import('../../database/connection')
    const { hashPassword, comparePassword } = await import('../../shared/utils/hash')
    const [rows]: any = await db.execute(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [req.userId]
    )
    if (!rows.length) return rep.status(404).send({ success: false, error: 'Usuário não encontrado' })
    const valid = await comparePassword(currentPassword, rows[0].password)
    if (!valid) return rep.status(401).send({ success: false, error: 'Senha atual incorreta' })
    const hash = await hashPassword(newPassword)
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hash, req.userId])
    // Registra no log
    await db.execute(
      "INSERT INTO access_logs (tenant_id, user_id, email, action, details) VALUES (?,?,?,'password_reset','Alteração pelo próprio usuário')",
      [req.tenantId, req.userId, rows[0].email]
    )
    return rep.send({ success: true, message: 'Senha alterada com sucesso' })
  })
}