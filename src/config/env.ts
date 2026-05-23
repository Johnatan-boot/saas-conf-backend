import dotenv from 'dotenv'
dotenv.config()

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const env = {
  port: Number(optional('PORT', '3000')),
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',

  db: {
    host:     optional('DB_HOST', 'localhost'),
    port:     Number(optional('DB_PORT', '3306')),
    user:     optional('DB_USER', 'root'),
    password: optional('DB_PASS', ''),
    name:     optional('DB_NAME', 'saas_confeitaria'),
    ssl:      optional('DB_SSL', 'false') === 'true',
  },

  jwtSecret:            optional('JWT_SECRET', 'dev_secret_change_in_production_32chars'),
  jwtExpiresIn:         optional('JWT_EXPIRES_IN', '1d'),
  jwtRefreshExpiresIn:  optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  stripeSecretKey:     optional('STRIPE_SECRET_KEY', ''),
  stripeWebhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),

  smtp: {
    host: optional('SMTP_HOST', 'smtp.gmail.com'),
    port: Number(optional('SMTP_PORT', '587')),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
  },

  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  JWT_SECRET:  optional('JWT_SECRET', 'dev_secret_change_in_production_32chars'),
}

export const integrationEnv = {
  telegramToken:   process.env.TELEGRAM_BOT_TOKEN ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  zapierWebhookUrl:process.env.ZAPIER_WEBHOOK_URL ?? '',
  groqApiKey:      process.env.GROQ_API_KEY ?? '',
}
