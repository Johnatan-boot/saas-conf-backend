// src/shared/webhooks/zapier.ts
// Dispara eventos para o Zapier automaticamente quando algo acontece no sistema

export async function triggerZapier(event: string, payload: Record<string, any>) {
  const url = process.env.ZAPIER_WEBHOOK_URL
  if (!url) return // silencioso se não configurado

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    })
  } catch (err) {
    console.warn('[Zapier] Falha ao disparar webhook:', err)
  }
}

// Eventos pré-definidos — use em qualquer service
export const ZapierEvents = {
  NEW_ORDER: 'new_order',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  NEW_CLIENT: 'new_client',
  LOW_STOCK: 'low_stock',
}
