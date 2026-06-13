// ============================================================
// ifood.service.ts
// Lógica de negócio: token caching, polling, importação de pedidos
// ============================================================

import { db } from '../../../database/connection'
import { getIFoodCredentials } from './ifood.credentials'
import * as api from './ifood.api'

// --- Cache de token por tenant (evita re-autenticar a cada request) ---
async function getValidToken(tenantId: number): Promise<string> {
  const [rows]: any = await db.execute(
    `SELECT client_id, client_secret, merchant_id, access_token, token_expires_at
     FROM tenant_integrations
     WHERE tenant_id = ? AND platform = 'ifood' AND is_active = 1`,
    [tenantId]
  )
  if (!rows.length) throw new Error('iFood não configurado para este tenant')

  const row = rows[0]
  const now = new Date()
  const expiry = row.token_expires_at ? new Date(row.token_expires_at) : null

  // Token ainda válido (com 5 min de margem)
  if (row.access_token && expiry && expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
    return row.access_token
  }

  // Busca credenciais (abstração Step 1 / Step 2)
  const creds = await getIFoodCredentials(tenantId)

  // Re-autentica
  const { accessToken, expiresIn } = await api.authenticate(creds.clientId, creds.clientSecret)
  const newExpiry = new Date(Date.now() + expiresIn * 1000)

  await db.execute(
    `UPDATE tenant_integrations
     SET access_token = ?, token_expires_at = ?, updated_at = NOW()
     WHERE tenant_id = ? AND platform = 'ifood'`,
    [accessToken, newExpiry, tenantId]
  )

  return accessToken
}

// --- Salvar/atualizar configuração de integração ---
export async function saveIntegration(tenantId: number, platform: string, data: {
  clientId?: string; clientSecret?: string; merchantId?: string
}) {
  // Testa as credenciais antes de salvar
  if (data.clientId && data.clientSecret) {
    try {
      await api.authenticate(data.clientId, data.clientSecret)
    } catch {
      throw new Error('Credenciais inválidas — verifique seu Client ID e Client Secret no iFood')
    }
  }

  await db.execute(
    `INSERT INTO tenant_integrations (tenant_id, platform, client_id, client_secret, merchant_id, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       client_id = VALUES(client_id),
       client_secret = VALUES(client_secret),
       merchant_id = VALUES(merchant_id),
       is_active = 1, access_token = NULL, token_expires_at = NULL, last_error = NULL,
       updated_at = NOW()`,
    [tenantId, platform, data.clientId || null, data.clientSecret || null, data.merchantId || null]
  )
}

// --- Buscar status da integração ---
export async function getIntegrationStatus(tenantId: number, platform: string) {
  const [rows]: any = await db.execute(
    `SELECT is_active, merchant_id, last_sync_at, last_error,
            CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END AS has_credentials
     FROM tenant_integrations
     WHERE tenant_id = ? AND platform = ?`,
    [tenantId, platform]
  )
  return rows[0] || null
}

// --- Desconectar integração ---
export async function disconnectIntegration(tenantId: number, platform: string) {
  await db.execute(
    `UPDATE tenant_integrations SET is_active = 0, access_token = NULL WHERE tenant_id = ? AND platform = ?`,
    [tenantId, platform]
  )
}

// --- Polling: busca novos pedidos do iFood ---
export async function pollIFoodOrders(tenantId: number) {
  const token = await getValidToken(tenantId)
  const creds = await getIFoodCredentials(tenantId)

  const events = await api.pollEvents(token, creds.merchantId)
  if (!events || events.length === 0) {
    await db.execute(
      'UPDATE tenant_integrations SET last_sync_at = NOW() WHERE tenant_id = ? AND platform = "ifood"',
      [tenantId]
    )
    return { imported: 0, events: [] }
  }

  const imported: any[] = []
  const eventIds: string[] = []

  for (const event of events) {
    eventIds.push(event.id)

    // Só processa eventos de CRIAÇÃO de pedido
    if (event.code !== 'PLC') continue

    try {
      const orderId = event.orderId
      // Verifica se já foi importado
      const [existing]: any = await db.execute(
        'SELECT id FROM marketplace_orders WHERE external_id = ? AND platform = "ifood"',
        [orderId]
      )
      if (existing.length > 0) continue

      // Busca detalhes completos do pedido
      const ifoodOrder = await api.getOrder(token, orderId)

      // Importa para a tabela orders do sistema
      const internalOrderId = await importOrder(tenantId, ifoodOrder)

      // Registra na tabela de marketplace_orders
      await db.execute(
        `INSERT INTO marketplace_orders (tenant_id, platform, external_id, order_id, raw_payload, status, acknowledged)
         VALUES (?, 'ifood', ?, ?, ?, ?, 1)`,
        [tenantId, orderId, internalOrderId, JSON.stringify(ifoodOrder), ifoodOrder.fullCode || 'placed']
      )

      imported.push({ externalId: orderId, internalId: internalOrderId })
    } catch (err: any) {
      console.error(`[iFood] Erro ao importar pedido ${event.orderId}:`, err.message)
    }
  }

  // Faz ACK de todos os eventos processados
  if (eventIds.length > 0) await api.ackEvents(token, eventIds)

  await db.execute(
    'UPDATE tenant_integrations SET last_sync_at = NOW(), last_error = NULL WHERE tenant_id = ? AND platform = "ifood"',
    [tenantId]
  )

  return { imported: imported.length, events: imported }
}

// --- Importa pedido iFood → orders do sistema ---
async function importOrder(tenantId: number, ifoodOrder: any): Promise<number> {
  const clientName = ifoodOrder.customer?.name || 'Cliente iFood'
  const total = ifoodOrder.totalPrice || 0
  const deliveryAddress = ifoodOrder.delivery?.deliveryAddress
    ? `${ifoodOrder.delivery.deliveryAddress.streetName}, ${ifoodOrder.delivery.deliveryAddress.streetNumber}`
    : null
  const code = `IFD-${ifoodOrder.shortReference || Date.now()}`

  const [res]: any = await db.execute(
    `INSERT INTO orders
       (tenant_id, code, status, delivery_type, delivery_address, subtotal, discount, total, notes, created_at)
     VALUES (?, ?, 'pending', 'delivery', ?, ?, 0, ?, ?, NOW())`,
    [
      tenantId, code, deliveryAddress,
      total, total,
      `Pedido iFood #${ifoodOrder.shortReference || ''} — ${clientName}`,
    ]
  )
  const orderId = res.insertId

  // Importa os itens
  for (const item of ifoodOrder.items || []) {
    await db.execute(
      `INSERT INTO order_items (order_id, product_name, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, item.name, item.quantity, item.unitPrice, item.totalPrice]
    )
  }

  return orderId
}

// --- Confirmar pedido no iFood ---
export async function confirmIFoodOrder(tenantId: number, externalOrderId: string) {
  const token = await getValidToken(tenantId)
  await api.confirmOrder(token, externalOrderId)
  await db.execute(
    `UPDATE marketplace_orders SET status = 'confirmed', updated_at = NOW()
     WHERE external_id = ? AND platform = 'ifood'`,
    [externalOrderId]
  )
}

// --- Despachar pedido ---
export async function dispatchIFoodOrder(tenantId: number, externalOrderId: string) {
  const token = await getValidToken(tenantId)
  await api.dispatchOrder(token, externalOrderId)
  await db.execute(
    `UPDATE marketplace_orders SET status = 'dispatched', updated_at = NOW()
     WHERE external_id = ? AND platform = 'ifood'`,
    [externalOrderId]
  )
}

// --- Listar pedidos importados do iFood ---
export async function listMarketplaceOrders(tenantId: number, platform: string) {
  const [rows]: any = await db.execute(
    `SELECT mo.*, o.code AS order_code, o.total AS order_total, o.status AS order_status
     FROM marketplace_orders mo
     LEFT JOIN orders o ON o.id = mo.order_id
     WHERE mo.tenant_id = ? AND mo.platform = ?
     ORDER BY mo.created_at DESC
     LIMIT 50`,
    [tenantId, platform]
  )
  return rows
}

// --- Sincronizar produto no cardápio do iFood ---
export async function syncProductToIFood(tenantId: number, product: {
  externalCode: string; price: number; available: boolean
}) {
  const token = await getValidToken(tenantId)
  const creds = await getIFoodCredentials(tenantId)
  await api.syncProduct(token, creds.merchantId, product)
}
