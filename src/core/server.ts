import { buildApp } from './app'
import { env } from '../config/env'
import { testConnection } from '../database/connection'
import { runMigrations } from '../database/migrate'

const start = async () => {
  const app = buildApp()

  try {
    await testConnection()
    await runMigrations()
    console.log('✅ Migrations executadas')

    await app.listen({ port: env.port, host: '0.0.0.0' })
    console.log(`🚀 Servidor rodando na porta ${env.port}`)
    console.log(`📦 Ambiente: ${env.nodeEnv}`)
    console.log(`🌐 Frontend permitido: ${env.frontendUrl}`)
  } catch (err) {
    console.error('❌ Erro ao iniciar servidor:', err)
    process.exit(1)
  }
}

start()
