import fs from 'fs'
import path from 'path'
import { db } from './connection'

export async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  await db.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const file of files) {
    const [rows]: any = await db.execute('SELECT id FROM migrations WHERE filename = ?', [file])
    if (rows.length > 0) continue

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean)

    for (const stmt of statements) {
      await db.execute(stmt)
    }

    await db.execute('INSERT INTO migrations (filename) VALUES (?)', [file])
    console.log(`✅ Migration executada: ${file}`)
  }
}
