import { FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: number
    clientId?: number
    userId: number
    userRole: string
    tenant: {
      id: number
      name: string
      slug: string
      plan: string
      plan_status: string
    }
  }
}
