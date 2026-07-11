import { buildApp } from './app'
import { env } from '../config/env'
import { testConnection } from '../database/connection'
import { runMigrations } from '../database/migrate'
import { db } from '../database/connection'
import { hashPassword } from '../shared/utils/hash'

async function runSeedIfEmpty() {
  try {
    const [rows]: any = await db.execute('SELECT COUNT(*) as count FROM tenants')
    const count = rows[0]?.count || 0

    if (count > 0) {
      console.log('✅ Banco já possui dados, seed ignorado')
      return
    }

    console.log('🌱 Banco vazio — executando seed inicial...')

    await db.execute(`INSERT IGNORE INTO tenants (id,name,slug,email,plan,plan_status) 
      VALUES (1,'Confeitaria da Ana','confeitaria-da-ana','ana@demo.com','premium','active')`)

    const pwd = await hashPassword('admin123')
    await db.execute(`INSERT IGNORE INTO users (id,tenant_id,name,email,password,role,is_active) 
      VALUES (1,1,'Admin','admin@demo.com',?,'admin',1)`, [pwd])
    await db.execute(`INSERT IGNORE INTO users (id,tenant_id,name,email,password,role,is_active) 
      VALUES (2,1,'Atendente','atendente@demo.com',?,'staff',1)`, [pwd])

    await db.execute(`INSERT IGNORE INTO categories (id,tenant_id,name) 
      VALUES (1,1,'Bolos'),(2,1,'Doces'),(3,1,'Tortas'),(4,1,'Bebidas')`)

    const products = [
      [1,1,1,'Bolo de Chocolate','Bolo artesanal de chocolate belga',89.90,45.00,'unidade',15,2],
      [2,1,1,'Bolo Red Velvet','Bolo red velvet com cream cheese',95.00,48.00,'unidade',8,2],
      [3,1,2,'Brigadeiro Gourmet','Caixa com 16 unidades',65.00,28.00,'caixa',30,5],
      [4,1,3,'Torta de Limão','Torta de limão siciliano',75.00,35.00,'unidade',5,2],
      [5,1,2,'Bem-casado','Par de bem-casados tradicionais',12.00,5.00,'par',50,10],
      [6,1,1,'Bolo Naked','Bolo naked florido para casamentos',180.00,85.00,'unidade',3,1],
    ]
    for (const p of products) {
      await db.execute(
        `INSERT IGNORE INTO products (id,tenant_id,category_id,name,description,price,cost_price,unit,stock,min_stock) 
         VALUES (?,?,?,?,?,?,?,?,?,?)`, p)
    }

    const clients = [
      [1,1,'Maria Silva','maria@email.com','(11) 99999-1111'],
      [2,1,'João Santos','joao@email.com','(11) 99999-2222'],
      [3,1,'Ana Oliveira','ana@email.com','(11) 99999-3333'],
    ]
    for (const c of clients) {
      await db.execute(`INSERT IGNORE INTO clients (id,tenant_id,name,email,phone) VALUES (?,?,?,?,?)`, c)
    }

    console.log('✅ Seed concluído!')
    console.log('📧 Login: admin@demo.com | Senha: admin123')
    console.log('🏪 Tenant Slug: confeitaria-da-ana')
  } catch (err) {
    console.error('⚠️ Erro no seed (não crítico):', err)
  }
}

const start = async () => {
  const app = buildApp()

  try {
    await testConnection()
    await runMigrations()
    await runSeedIfEmpty()  // ← roda só se banco estiver vazio
    await ensureSuperAdmin()   // ← cria super admin se não existir
    await resetJonyAdminPassword() // ← reseta senha do admin da Jony (uma vez)

    await app.listen({ port: env.port, host: '0.0.0.0' })
    console.log(`🚀 Servidor rodando na porta ${env.port}`)
    console.log(`📦 Ambiente: ${env.nodeEnv}`)
    console.log(`🌐 Frontend permitido: ${env.frontendUrl}`)
  } catch (err) {
    console.error('❌ Erro ao iniciar servidor:', err)
    process.exit(1)
  }
}

// ── Garante que o super admin existe (idempotente) ────────────────────────
async function ensureSuperAdmin() {
  try {
    const email = 'johnatan.quenes@gmail.com'
    const [existing]: any = await db.execute(
      "SELECT id FROM users WHERE email=? AND role='super_admin' LIMIT 1", [email]
    )
    if (existing.length > 0) {
      console.log('✅ Super Admin já existe:', email)
      return
    }
    // Pega o primeiro tenant como âncora (ou cria com tenant_id=1)
    const [tenants]: any = await db.execute('SELECT id FROM tenants ORDER BY id ASC LIMIT 1')
    const tenantId = tenants[0]?.id || 1
    const pwd = await hashPassword('Jony967745@$$')
    await db.execute(
      "INSERT INTO users (tenant_id, name, email, password, role, is_active) VALUES (?,?,?,?,?,1)",
      [tenantId, 'Diego Super Admin', email, pwd, 'super_admin']
    )
    console.log('✅ Super Admin criado:', email)
  } catch (err) {
    console.error('⚠️ Erro ao criar super admin (não crítico):', err)
  }
}

// ── Reset de senha da Confeitaria do Jony (one-shot com flag) ─────────────
async function resetJonyAdminPassword() {
  try {
    // Usa access_logs como flag — só reseta se não tiver registro
    const [flag]: any = await db.execute(
      "SELECT id FROM access_logs WHERE action='password_reset' AND details='jony_seed_v1' LIMIT 1"
    )
    if (flag.length > 0) return // já foi feito

    const [jonyTenant]: any = await db.execute(
      "SELECT id FROM tenants WHERE slug='confeitaria-do-jony' LIMIT 1"
    )
    if (!jonyTenant.length) return

    const tenantId = jonyTenant[0].id
    const pwd = await hashPassword('Jony9677@$$')
    const [updated]: any = await db.execute(
      "UPDATE users SET password=? WHERE tenant_id=? AND role IN ('admin','manager')",
      [pwd, tenantId]
    )

    if ((updated as any).affectedRows > 0) {
      // Registra flag para não repetir
      await db.execute(
        "INSERT INTO access_logs (action, details) VALUES ('password_reset','jony_seed_v1')"
      )
      console.log('✅ Senha do admin da Confeitaria do Jony resetada para: Jony9677@$$')
    }
  } catch (err) {
    console.error('⚠️ Erro ao resetar senha da Jony (não crítico):', err)
  }
}

start()
