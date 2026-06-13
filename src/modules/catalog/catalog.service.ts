import { db } from '../../database/connection'

export async function getPublicStore(slug: string) {
  const [rows]: any = await db.execute(
    `SELECT primary_color AS primaryColor, secondary_color AS secondaryColor,
            background_color AS backgroundColor, text_color AS textColor,
            card_color AS cardColor, logo_url AS logoUrl,
            store_name AS storeName, tagline, slug,
            instagram, facebook, whatsapp, youtube
     FROM store_themes WHERE slug = ?`, [slug]
  )
  if (!rows.length) return null
  return rows[0]
}

export async function getPublicProducts(slug: string) {
  const [tenantRow]: any = await db.execute(
    'SELECT tenant_id FROM store_themes WHERE slug = ?', [slug]
  )
  if (!tenantRow.length) return null
  const tenantId = tenantRow[0].tenant_id

  // REGRA: só aparece produto com stock > 0, ativo e não excluído.
  // category vem via JOIN (category_name não existe na tabela products)
  const [rows]: any = await db.execute(
    `SELECT
       p.id, p.name, p.description, p.price,
       p.image_url AS imageUrl,
       c.name      AS category,
       p.stock
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.tenant_id = ?
       AND p.stock > 0
       AND p.is_active = 1
       AND p.deleted_at IS NULL
     ORDER BY p.name ASC`,
    [tenantId]
  )
  return rows
}

export async function createPublicOrder(slug: string, payload: any) {
  const [tenantRow]: any = await db.execute(
    'SELECT tenant_id FROM store_themes WHERE slug = ?', [slug]
  )
  if (!tenantRow.length) return null
  const tenantId = tenantRow[0].tenant_id

  const conn = await (db as any).getConnection()
  try {
    await conn.beginTransaction()

    // Verifica estoque de cada produto
    for (const item of payload.items) {
      const [prodRows]: any = await conn.execute(
        'SELECT id, stock FROM products WHERE id = ? AND tenant_id = ?',
        [item.productId, tenantId]
      )
      if (!prodRows.length) throw new Error(`Produto não encontrado: ${item.productId}`)
      if (prodRows[0].stock < item.quantity) throw new Error('Estoque insuficiente')
    }

    // Gera código do pedido
    const code = `CAT-${Date.now()}`

    // Cria o pedido
    const [orderRes]: any = await conn.execute(
      `INSERT INTO orders (tenant_id, code, status, delivery_type, subtotal, discount, total, notes, created_at)
       VALUES (?, ?, 'pending', 'pickup', ?, 0, ?, ?, NOW())`,
      [tenantId, code, payload.total, payload.total, payload.customer.notes || null]
    )
    const orderId = orderRes.insertId

    // Insere itens e desconta estoque
    for (const item of payload.items) {
      const [prodInfo]: any = await conn.execute(
        'SELECT name FROM products WHERE id = ?', [item.productId]
      )
      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.productId, prodInfo[0]?.name || '', item.quantity, item.price, item.price * item.quantity]
      )
      // Desconta estoque em tempo real
      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ? AND tenant_id = ?',
        [item.quantity, item.productId, tenantId]
      )
    }

    await conn.commit()
    return { orderId: `#${orderId}`, code }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
