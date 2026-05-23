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
