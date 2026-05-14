import { db } from './connection'
import { hashPassword } from '../shared/utils/hash'
import { runMigrations } from './migrate'

async function seed() {
  await runMigrations()
  console.log('🌱 Iniciando seed...')

  // Tenant demo
  await db.execute(`INSERT IGNORE INTO tenants (id,name,slug,email,plan) VALUES (1,'Confeitaria da Ana','confeitaria-da-ana','ana@demo.com','pro')`)

  // Admin user
  const pwd = await hashPassword('admin123')
  await db.execute(`INSERT IGNORE INTO users (id,tenant_id,name,email,password,role) VALUES (1,1,'Admin Demo','admin@demo.com',?,'admin')`,[pwd])
  await db.execute(`INSERT IGNORE INTO users (id,tenant_id,name,email,password,role) VALUES (2,1,'Atendente','atendente@demo.com',?,'staff')`,[pwd])

  // Categorias
  await db.execute(`INSERT IGNORE INTO categories (id,tenant_id,name) VALUES (1,1,'Bolos'),(2,1,'Doces'),(3,1,'Tortas'),(4,1,'Bebidas')`)

  // Produtos
  const products = [
    [1,1,1,'Bolo de Chocolate','Bolo artesanal de chocolate belga',89.90,45.00,'unidade',15,2],
    [2,1,1,'Bolo Red Velvet','Bolo red velvet com cream cheese',95.00,48.00,'unidade',8,2],
    [3,1,2,'Brigadeiro Gourmet','Caixa com 16 unidades',65.00,28.00,'caixa',30,5],
    [4,1,3,'Torta de Limão','Torta de limão siciliano',75.00,35.00,'unidade',5,2],
    [5,1,2,'Bem-casado','Par de bem-casados tradicionais',12.00,5.00,'par',50,10],
    [6,1,1,'Bolo Naked','Bolo naked florido para casamentos',180.00,85.00,'unidade',3,1],
  ]
  for (const p of products) {
    await db.execute(`INSERT IGNORE INTO products (id,tenant_id,category_id,name,description,price,cost_price,unit,stock,min_stock) VALUES (?,?,?,?,?,?,?,?,?,?)`, p)
  }

  // Clientes
  const clients = [
    [1,1,'Maria Silva','maria@email.com','(11) 99999-1111'],
    [2,1,'João Santos','joao@email.com','(11) 99999-2222'],
    [3,1,'Ana Oliveira','ana@email.com','(11) 99999-3333'],
    [4,1,'Pedro Costa','pedro@email.com','(11) 99999-4444'],
  ]
  for (const c of clients) {
    await db.execute(`INSERT IGNORE INTO clients (id,tenant_id,name,email,phone) VALUES (?,?,?,?,?)`, c)
  }

  // Pedidos demo
  await db.execute(`INSERT IGNORE INTO orders (id,tenant_id,client_id,user_id,code,status,total,subtotal) VALUES (1,1,1,1,'PED-001','delivered',89.90,89.90)`)
  await db.execute(`INSERT IGNORE INTO orders (id,tenant_id,client_id,user_id,code,status,total,subtotal) VALUES (2,1,2,1,'PED-002','in_production',160.00,160.00)`)
  await db.execute(`INSERT IGNORE INTO orders (id,tenant_id,client_id,user_id,code,status,total,subtotal) VALUES (3,1,3,1,'PED-003','pending',75.00,75.00)`)

  await db.execute(`INSERT IGNORE INTO order_items (order_id,product_id,product_name,quantity,unit_price,total_price) VALUES (1,1,'Bolo de Chocolate',1,89.90,89.90)`)
  await db.execute(`INSERT IGNORE INTO order_items (order_id,product_id,product_name,quantity,unit_price,total_price) VALUES (2,6,'Bolo Naked',1,180.00,180.00)`)
  await db.execute(`INSERT IGNORE INTO order_items (order_id,product_id,product_name,quantity,unit_price,total_price) VALUES (3,4,'Torta de Limão',1,75.00,75.00)`)

  await db.execute(`INSERT IGNORE INTO payments (tenant_id,order_id,amount,method,status,paid_at) VALUES (1,1,89.90,'pix','paid',NOW())`)

  console.log('✅ Seed concluído!')
  console.log('📧 Login: admin@demo.com | Senha: admin123')
  console.log('🏪 Tenant ID: 1 | Tenant Slug: confeitaria-da-ana')
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
