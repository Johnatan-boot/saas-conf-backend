import { listOrders, findOrderById, createOrder, addOrderItem, updateOrderStatus, updateOrder, deleteOrder } from './order.repository'
import { findProductById } from '../products/product.repository'
import { updateClientStats } from '../clients/client.repository'
import { db } from '../../database/connection'
import { NotFoundError, AppError } from '../../shared/errors/appError'
import { triggerZapier, ZapierEvents } from '../../shared/webhooks/zapier'
import { notifyAllSessions } from '../telegram/telegram.bot'
import { integrationEnv } from '../../config/env'

export async function listOrdersService(tenantId: number, filters?: any) {
  return listOrders(tenantId, filters)
}

export async function getOrderService(id: number, tenantId: number) {
  const order = await findOrderById(id, tenantId)
  if (!order) throw new NotFoundError('Pedido')
  return order
}

export async function createOrderService(tenantId: number, userId: number, data: {
  client_id?: number
  items: Array<{ product_id?: number; product_name?: string; quantity: number; unit_price?: number; notes?: string }>
  delivery_date?: string
  delivery_type?: string
  delivery_address?: string
  discount?: number
  notes?: string
}) {
  let subtotal = 0
  const resolvedItems: any[] = []

  for (const item of data.items) {
    let unit_price = item.unit_price || 0
    let product_name = item.product_name || 'Item avulso'

    if (item.product_id) {
      const product = await findProductById(item.product_id, tenantId)
      if (!product) throw new NotFoundError(`Produto #${item.product_id}`)
      unit_price = unit_price || Number(product.price)
      product_name = product.name
    }
    subtotal += item.quantity * unit_price
    resolvedItems.push({ ...item, unit_price, product_name })
  }

  const discount = data.discount || 0
  const total = subtotal - discount

  const orderId = await createOrder({
    ...data, tenant_id: tenantId, user_id: userId,
    subtotal, discount, total
  })

  for (const item of resolvedItems) {
    await addOrderItem(orderId, item)
  }

  if (data.client_id) await updateClientStats(data.client_id)

  const order = await findOrderById(orderId, tenantId)

  // Zapier
  triggerZapier(ZapierEvents.NEW_ORDER, {
    order_code: order?.code,
    client_name: order?.client_name || 'Avulso',
    total,
    tenant_id: tenantId,
    delivery_date: data.delivery_date,
    items: resolvedItems.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', '),
  }).catch(() => {})

  // Telegram
  if (integrationEnv.telegramToken) {
    const msg = `🛒 <b>Novo Pedido!</b>\n📋 ${order?.code}\n👤 ${order?.client_name || 'Avulso'}\n💰 R$ ${Number(total).toFixed(2).replace('.', ',')}`
    notifyAllSessions(integrationEnv.telegramToken, tenantId, msg).catch(() => {})
  }

  return order
}

export async function updateOrderStatusService(id: number, tenantId: number, status: string) {
  const order = await findOrderById(id, tenantId)
  if (!order) throw new NotFoundError('Pedido')
  const validStatus = ['pending','confirmed','in_production','ready','delivered','cancelled']
  if (!validStatus.includes(status)) throw new AppError('Status inválido')
  await updateOrderStatus(id, tenantId, status)
  if (status === 'delivered' && order.client_id) await updateClientStats(order.client_id)

  const updated = await findOrderById(id, tenantId)

  // Zapier
  triggerZapier(ZapierEvents.ORDER_STATUS_CHANGED, {
    order_code: order.code,
    client_name: order.client_name || 'Avulso',
    old_status: order.status,
    new_status: status,
    total: order.total,
    tenant_id: tenantId,
  }).catch(() => {})

  // Telegram (avisa quando entregue)
  if (status === 'delivered' && integrationEnv.telegramToken) {
    const msg = `✅ <b>Pedido Entregue!</b>\n📋 ${order.code}\n👤 ${order.client_name || 'Avulso'}\n💰 R$ ${Number(order.total).toFixed(2).replace('.', ',')}`
    notifyAllSessions(integrationEnv.telegramToken, tenantId, msg).catch(() => {})
  }

  return updated
}

export async function updateOrderService(id: number, tenantId: number, data: any) {
  if (!await findOrderById(id, tenantId)) throw new NotFoundError('Pedido')
  await updateOrder(id, tenantId, data)
  return findOrderById(id, tenantId)
}

export async function deleteOrderService(id: number, tenantId: number) {
  if (!await findOrderById(id, tenantId)) throw new NotFoundError('Pedido')
  await deleteOrder(id, tenantId)
}
