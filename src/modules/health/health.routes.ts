import { FastifyInstance } from 'fastify'
import { db } from '../../database/connection'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (req, rep) => {
    try {
      await db.execute('SELECT 1')
      return rep.send({ status:'ok', db:'connected', timestamp: new Date().toISOString() })
    } catch(e: any) {
      return rep.status(503).send({ status:'error', db:'disconnected', error: e.message })
    }
  })
}
