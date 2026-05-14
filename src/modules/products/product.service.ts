import { listProducts, findProductById, createProduct, updateProduct, deleteProduct, getLowStockProducts } from './product.repository'
import { NotFoundError } from '../../shared/errors/appError'

export async function listProductsService(tenantId: number, filters?: any) {
  return listProducts(tenantId, filters)
}
export async function getProductService(id: number, tenantId: number) {
  const p = await findProductById(id, tenantId)
  if (!p) throw new NotFoundError('Produto')
  return p
}
export async function createProductService(tenantId: number, data: any) {
  const id = await createProduct({ ...data, tenant_id: tenantId })
  return findProductById(id, tenantId)
}
export async function updateProductService(id: number, tenantId: number, data: any) {
  const p = await findProductById(id, tenantId)
  if (!p) throw new NotFoundError('Produto')
  await updateProduct(id, tenantId, data)
  return findProductById(id, tenantId)
}
export async function deleteProductService(id: number, tenantId: number) {
  if (!await findProductById(id, tenantId)) throw new NotFoundError('Produto')
  await deleteProduct(id, tenantId)
}
export async function getLowStockService(tenantId: number) {
  return getLowStockProducts(tenantId)
}
