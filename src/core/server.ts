import { buildApp } from './app'
import { env } from '../config/env'
import { testConnection } from '../database/connection'
import { runMigrations } from '../database/migrate'

const start = async () => {
  const app = buildApp()

  try {
    await testConnection()
    await runMigrations()

    await app.listen({ port: env.port, host: '0.0.0.0' })
    console.log(`🚀 Servidor rodando na porta ${env.port}`)
    console.log(`📦 Ambiente: ${env.nodeEnv}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
