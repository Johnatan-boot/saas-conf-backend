import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from './appError'
import { ZodError } from 'zod'

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error)

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: error.message,
    })
  }

  if (error instanceof ZodError) {
    return reply.status(422).send({
      success: false,
      error: 'Dados inválidos',
      details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    })
  }

  if ((error as any).statusCode === 400 && (error as any).validation) {
    return reply.status(400).send({
      success: false,
      error: 'Dados inválidos',
      details: (error as any).validation,
    })
  }

  if ((error as any).code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
      (error as any).code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' ||
      (error as any).code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.status(401).send({ success: false, error: 'Token inválido ou expirado' })
  }

  if ((error as any).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return reply.status(413).send({
      success: false,
      error: 'Arquivo muito grande. Reduza o tamanho da imagem e tente novamente.',
    })
  }

  return reply.status(500).send({
    success: false,
    error: 'Erro interno do servidor',
  })
}
