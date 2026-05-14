import jwt from 'jsonwebtoken'
import { env } from '../../config/env'

export interface JwtPayload {
  userId: number
  tenantId: number
  role: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as any)
}

export function signRefreshToken(payload: Pick<JwtPayload, 'userId' | 'tenantId'>): string {
  return jwt.sign(payload, env.jwtSecret + '_refresh', { expiresIn: env.jwtRefreshExpiresIn } as any)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload
}

export function verifyRefreshToken(token: string): Pick<JwtPayload, 'userId' | 'tenantId'> {
  return jwt.verify(token, env.jwtSecret + '_refresh') as any
}
