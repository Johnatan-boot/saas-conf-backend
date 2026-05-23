import mysql from 'mysql2/promise'
import { env } from '../config/env'

const poolConfig: mysql.PoolOptions = {
  host:             env.db.host,
  port:             env.db.port,
  user:             env.db.user,
  password:         env.db.password,
  database:         env.db.name,
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  timezone:         '-03:00',
  connectTimeout:   30000,
}

// SSL obrigatório para bancos na nuvem (Clever Cloud, Railway, etc)
if (env.db.ssl) {
  poolConfig.ssl = { rejectUnauthorized: false }
}

export const db = mysql.createPool(poolConfig)

export async function testConnection() {
  try {
    const conn = await db.getConnection()
    await conn.ping()
    conn.release()
    console.log('✅ Banco de dados conectado com sucesso')
  } catch (err: any) {
    console.error('❌ Erro ao conectar banco:', err.message)
    throw err
  }
}
