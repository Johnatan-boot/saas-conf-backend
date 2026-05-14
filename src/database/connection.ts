import mysql from 'mysql2/promise'
import { env } from '../config/env'

export const db = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-03:00',
})

export async function testConnection() {
  const conn = await db.getConnection()
  await conn.ping()
  conn.release()
  console.log('✅ Banco de dados conectado com sucesso')
}
