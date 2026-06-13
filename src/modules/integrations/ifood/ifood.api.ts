// ============================================================
// ifood.api.ts
// Chamadas diretas à Merchant-API do iFood
// Documentação: https://developer.ifood.com.br
// ============================================================

const BASE = 'https://merchant-api.ifood.com.br'

export interface IFoodToken {
  accessToken: string
  expiresIn: number   // segundos
}

// --- Autenticação OAuth2 ---
export async function authenticate(clientId: string, clientSecret: string): Promise<IFoodToken> {
  const res = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grantType: 'client_credentials',
      clientId,
      clientSecret,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`iFood auth falhou: ${err}`)
  }
  const data = await res.json()
  return { accessToken: data.accessToken, expiresIn: data.expiresIn }
}

// --- Polling de eventos (novos pedidos, cancelamentos, etc.) ---
export async function pollEvents(token: string, merchantId: string) {
  const res = await fetch(
    `${BASE}/order/v1.0/events:polling?merchantId=${merchantId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return []
  return res.json()
}

// --- Acknowledge (confirmar recebimento dos eventos) ---
export async function ackEvents(token: string, eventIds: string[]) {
  await fetch(`${BASE}/order/v1.0/events/ack`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventIds.map(id => ({ id }))),
  })
}

// --- Buscar detalhes de um pedido ---
export async function getOrder(token: string, orderId: string) {
  const res = await fetch(`${BASE}/order/v1.0/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Pedido iFood não encontrado: ${orderId}`)
  return res.json()
}

// --- Confirmar pedido ---
export async function confirmOrder(token: string, orderId: string) {
  await fetch(`${BASE}/order/v1.0/orders/${orderId}/statuses/confirmation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- Despachar pedido (em rota) ---
export async function dispatchOrder(token: string, orderId: string) {
  await fetch(`${BASE}/order/v1.0/orders/${orderId}/statuses/dispatch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- Marcar como pronto para retirada ---
export async function readyToPickup(token: string, orderId: string) {
  await fetch(`${BASE}/order/v1.0/orders/${orderId}/statuses/readyToPickup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- Solicitar cancelamento ---
export async function requestCancellation(token: string, orderId: string, reason: string) {
  await fetch(`${BASE}/order/v1.0/orders/${orderId}/statuses/cancellationRequested`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
}

// --- Sincronizar disponibilidade/preço de produto no cardápio ---
export async function syncProduct(token: string, merchantId: string, product: {
  externalCode: string
  price?: number
  available?: boolean
}) {
  await fetch(`${BASE}/catalog/v2.0/merchants/${merchantId}/items`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      externalCode: product.externalCode,
      ...(product.price !== undefined && { price: { value: product.price } }),
      ...(product.available !== undefined && { status: { availability: product.available ? 'AVAILABLE' : 'UNAVAILABLE' } }),
    }]),
  })
}

// --- Listar lojas do merchantId ---
export async function getMerchants(token: string) {
  const res = await fetch(`${BASE}/merchant/v1.0/merchants`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  return res.json()
}
