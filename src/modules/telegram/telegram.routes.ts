import { FastifyInstance } from 'fastify'
import { handleTelegramUpdate } from './telegram.bot'
import { integrationEnv } from '../../config/env'

export async function telegramRoutes(app: FastifyInstance) {
  app.post('/webhook', async (req: any, reply: any) => {
    const token = integrationEnv.telegramToken
    const apiKey = integrationEnv.groqApiKey
    if (!token) return reply.code(503).send({ error: 'Telegram não configurado' })
    try {
      await handleTelegramUpdate(req.body as any, token, apiKey)
      return reply.code(200).send({ ok: true })
    } catch (err) {
      console.error('[Telegram] Erro:', err)
      return reply.code(200).send({ ok: true })
    }
  })

  app.get('/setup', async (req: any, reply: any) => {
    const token = integrationEnv.telegramToken
    if (!token) return reply.code(503).send({ error: 'TELEGRAM_BOT_TOKEN não definido' })
    const host = (req.headers['x-forwarded-host'] || req.hostname) as string
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const webhookUrl = `${proto}://${host}/api/telegram/webhook`
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    })
    const data = await res.json()
    return reply.send({ webhookUrl, telegram: data })
  })

  app.get('/status', async (_req: any, reply: any) => {
    const token = integrationEnv.telegramToken
    if (!token) return reply.send({ configured: false })
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data: any = await res.json()
    return reply.send({ configured: true, bot: data.result })
  })
}
