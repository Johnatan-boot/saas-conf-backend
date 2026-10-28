// ============================================================
// mailer.service.ts — envio de e-mail via SMTP (nodemailer)
//
// Funciona com qualquer provedor SMTP (Brevo, Resend, Gmail, etc).
// Variáveis: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
// ============================================================
import nodemailer, { Transporter } from 'nodemailer'
import { env } from '../../config/env'

let transporter: Transporter | null = null

export function isMailConfigured(): boolean {
  return Boolean(env.smtp.user && env.smtp.pass)
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465, // 465 = SSL direto; 587/2525 = STARTTLS
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  }
  return transporter
}

export interface MailInput {
  to: string
  subject: string
  html: string
  text: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}

export async function sendMail(input: MailInput): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error('SMTP não configurado (defina SMTP_USER e SMTP_PASS)')
  }
  const from = process.env.MAIL_FROM?.trim() || `"Mastercode | SweetFlow" <${env.smtp.user}>`
  await getTransporter().sendMail({ from, ...input })
}
