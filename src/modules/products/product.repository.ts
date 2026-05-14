import { db } from '../../database/connection'

export async function listProducts(tenantId: number, filters?: { search?:string; category_id?:number; active?:boolean }) {
  let sql = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.tenant_id=? AND p.deleted_at IS NULL'
  const params: any[] = [tenantId]
  if (filters?.search) { sql+=' AND p.name LIKE ?'; params.push(`%${filters.search}%`) }
  if (filters?.category_id) { sql+=' AND p.category_id=?'; params.push(filters.category_id) }
  if (filters?.active !== undefined) { sql+=' AND p.is_active=?'; params.push(filters.active) }
  sql += ' ORDER BY p.name'
  const [rows]: any = await db.execute(sql, params)
  return rows
}
export async function findProductById(id: number, tenantId: number) {
  const [rows]: any = await db.execute('SELECT * FROM products WHERE id=? AND tenant_id=? AND deleted_at IS NULL',[id,tenantId])
  return rows[0]||null
}
export async function createProduct(data: any) {
  const [r]: any = await db.execute(
    'INSERT INTO products (tenant_id,name,description,price,cost_price,unit,stock,min_stock,category_id,image_url) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [data.tenant_id,data.name,data.description||null,data.price,data.cost_price||null,data.unit||'unidade',data.stock||0,data.min_stock||0,data.category_id||null,data.image_url||null]
  )
  return r.insertId
}
export async function updateProduct(id: number, tenantId: number, data: any) {
  const allowed=['name','description','price','cost_price','unit','stock','min_stock','category_id','image_url','is_active']
  const fields=Object.keys(data).filter(k=>allowed.includes(k))
  if(!fields.length)return
  const set=fields.map(f=>`${f}=?`).join(', ')
  await db.execute(`UPDATE products SET ${set} WHERE id=? AND tenant_id=?`,[...fields.map(f=>data[f]),id,tenantId])
}
export async function deleteProduct(id: number, tenantId: number) {
  await db.execute('UPDATE products SET deleted_at=NOW() WHERE id=? AND tenant_id=?',[id,tenantId])
}
export async function getLowStockProducts(tenantId: number) {
  const [rows]: any = await db.execute('SELECT * FROM products WHERE tenant_id=? AND stock<=min_stock AND is_active=1 AND deleted_at IS NULL ORDER BY stock ASC',[tenantId])
  return rows
}
