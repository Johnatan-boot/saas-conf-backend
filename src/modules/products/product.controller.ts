import { FastifyRequest, FastifyReply } from 'fastify'
import {
  listProductsService, getProductService, createProductService,
  updateProductService, deleteProductService
} from './product.service'

export async function listProducts(req: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await listProductsService(tenantId, req.query)
  return reply.send({ success: true, data })
}

export async function getProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await getProductService(Number(req.params.id), tenantId)
  return reply.send({ success: true, data })
}

export async function createProduct(req: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await createProductService(tenantId, req.body as any)
  return reply.code(201).send({ success: true, data })
}

export async function updateProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { tenantId } = req as any
  const data = await updateProductService(Number(req.params.id), tenantId, req.body as any)
  return reply.send({ success: true, data })
}

export async function deleteProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { tenantId } = req as any
  await deleteProductService(Number(req.params.id), tenantId)
  return reply.code(204).send()
}
