import { FastifyRequest, FastifyReply } from 'fastify'
import {
  listOrdersService, getOrderService, createOrderService,
  updateOrderStatusService, updateOrderService, deleteOrderService
} from './order.service'

export async function listOrders(req: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await listOrdersService(tenantId, req.query)
  return reply.send({ success: true, data })
}

export async function getOrder(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await getOrderService(Number(req.params.id), tenantId)
  return reply.send({ success: true, data })
}

export async function createOrder(req: FastifyRequest, reply: FastifyReply) {
  const { tenantId, userId } = req as any
  const data = await createOrderService(tenantId, userId, req.body as any)
  return reply.code(201).send({ success: true, data })
}

export async function updateOrderStatus(req: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await updateOrderStatusService(Number(req.params.id), tenantId, req.body.status)
  return reply.send({ success: true, data })
}

export async function updateOrder(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await updateOrderService(Number(req.params.id), tenantId, req.body)
  return reply.send({ success: true, data })
}

export async function deleteOrder(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { tenantId } = req as any
  await deleteOrderService(Number(req.params.id), tenantId)
  return reply.code(204).send()
}
