// ============================================================
// purchase-email.service.ts
// E-mail de confirmação de compra + recibo em PDF.
// Disparado quando o webhook do gateway confirma o pagamento.
// ============================================================
import { db } from '../../database/connection'
import { sendMail, isMailConfigured } from './mailer.service'
import { buildReceiptPdf } from './receipt.pdf'
import { PurchaseData, COMPANY, loadPurchaseData, brl, dateBR, dateTimeBR } from './purchase.data'

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildPurchaseEmail(d: PurchaseData) {
  const rows: [string, string][] = [
    ['Recibo nº', d.receiptNumber],
    ['ID do pedido', d.externalReference],
    ['ID da assinatura', String(d.subscriptionId)],
    ['Gateway', d.gateway],
    ['Data do pagamento', dateTimeBR(d.paidAt)],
    ['Plano', d.planName],
    ['Ciclo', `${d.cycleLabel}${d.discountPct ? ` (${d.discountPct}% de desconto)` : ''}`],
    ['Mensalidade', brl(d.pricePerMonth)],
    ['Vigência', `${dateBR(d.startedAt)}${d.expiresAt ? ' até ' + dateBR(d.expiresAt) : ' (renovação mensal)'}`],
    ['Recursos do plano', d.planFeatures.join(', ')],
  ]
  const fidelidade = d.fidelity
    ? `Fidelidade de ${d.totalMonths} meses: em caso de rescisão antecipada (fora do prazo de arrependimento) incide multa de ${d.multaFidelidadePct}% sobre as mensalidades vincendas.`
    : 'Plano mensal, sem fidelidade: você pode cancelar a qualquer momento, sem multa, mantendo o acesso até o fim do ciclo já pago.'

  const tableRows = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 0;color:#7a6a5f;width:42%">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#2b1d14">${esc(v)}</td></tr>`).join('')

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f1ec;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="background:#5b3a29;color:#fff;padding:22px 28px"><div style="font-size:20px;font-weight:700">${esc(COMPANY.name)} | ${esc(COMPANY.product)}</div>
<div style="font-size:13px;opacity:.85;margin-top:4px">Confirmação de compra</div></td></tr>
<tr><td style="padding:26px 28px;color:#2b1d14;font-size:14px;line-height:1.55">
<p style="margin:0 0 12px">Olá, <strong>${esc(d.customerName)}</strong>!</p>
<p style="margin:0 0 18px">Recebemos o seu pagamento e o plano <strong>${esc(d.planName)}</strong> já está ativo para a sua confeitaria. Obrigado por escolher o ${esc(COMPANY.product)}!</p>
<div style="background:#f6f1ec;border-radius:10px;padding:14px 18px;margin-bottom:18px;text-align:center">
<div style="font-size:12px;color:#7a6a5f">TOTAL PAGO</div><div style="font-size:26px;font-weight:700;color:#5b3a29">${esc(brl(d.totalAmount))}</div></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">${tableRows}</table>
<h3 style="font-size:14px;margin:22px 0 6px;color:#5b3a29">Condições do contrato</h3>
<ul style="margin:0;padding-left:18px;font-size:13px">
<li>Contrato aceito: versão ${esc(d.contractVersion)}, em ${esc(dateTimeBR(d.contractAcceptedAt))}.</li>
<li>Direito de arrependimento: <strong>${d.arrependimentoDias} dias</strong> (até ${esc(dateBR(d.arrependimentoAte))}), com reembolso integral.</li>
<li>${esc(fidelidade)}</li>
<li>Para cancelar a renovação automática, avise com ${30} dias de antecedência.</li>
</ul>
<p style="margin:18px 0 0;font-size:13px">O recibo em PDF segue em anexo.</p>
<p style="margin:14px 0 0;font-size:11px;color:#8a7a6f">Este e-mail e o recibo anexo são comprovantes de compra e <strong>não têm valor fiscal</strong>. Dúvidas? Responda este e-mail${COMPANY.email ? ` ou escreva para ${esc(COMPANY.email)}` : ''}.</p>
</td></tr></table></td></tr></table></body></html>`

  const text = [
    `${COMPANY.name} | ${COMPANY.product}: Confirmação de compra`,
    '', `Olá, ${d.customerName}!`,
    `Recebemos o seu pagamento e o plano ${d.planName} está ativo.`, '',
    `TOTAL PAGO: ${brl(d.totalAmount)}`,
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    'CONDIÇÕES DO CONTRATO',
    `- Contrato aceito: versão ${d.contractVersion}, em ${dateTimeBR(d.contractAcceptedAt)}`,
    `- Arrependimento: ${d.arrependimentoDias} dias (até ${dateBR(d.arrependimentoAte)}), com reembolso integral`,
    `- ${fidelidade}`, '',
    'Este e-mail e o recibo anexo não têm valor fiscal.',
  ].join('\n')

  return { subject: `Confirmação de compra: plano ${d.planName} (${d.receiptNumber})`, html, text }
}

/** Envia o e-mail com o recibo. Lança erro se o envio falhar. */
export async function sendPurchaseEmailFor(d: PurchaseData): Promise<void> {
  const { subject, html, text } = buildPurchaseEmail(d)
  const pdf = await buildReceiptPdf(d)
  await sendMail({
    to: d.customerEmail, subject, html, text,
    attachments: [{ filename: `${d.receiptNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
  })
}

/**
 * Chamado quando o pagamento é confirmado. NUNCA lança erro (não pode
 * derrubar o webhook) e envia no máximo UM e-mail por assinatura.
 */
export async function sendPurchaseConfirmation(subscriptionId: number): Promise<void> {
  let claimed = false
  let dedupe = true
  try {
    if (!isMailConfigured()) {
      console.warn('[E-mail] SMTP não configurado: confirmação de compra NÃO enviada.')
      return
    }

    // Reserva o envio de forma atômica (webhooks podem chegar repetidos)
    try {
      const [res]: any = await db.execute(
        'UPDATE subscriptions SET confirmation_email_sent_at = NOW() WHERE id = ? AND confirmation_email_sent_at IS NULL',
        [subscriptionId]
      )
      if (res.affectedRows !== 1) return // já enviado
      claimed = true
    } catch (err: any) {
      if (err?.code === 'ER_BAD_FIELD_ERROR') {
        dedupe = false
        console.warn('[E-mail] Coluna confirmation_email_sent_at ausente: rode a migration 013. Enviando sem trava de duplicidade.')
      } else throw err
    }

    const data = await loadPurchaseData(subscriptionId)
    if (!data) return
    await sendPurchaseEmailFor(data)
    console.log(`[E-mail] Confirmação de compra enviada para ${data.customerEmail} (assinatura ${subscriptionId})`)
  } catch (err: any) {
    console.error('[E-mail] Falha ao enviar confirmação de compra:', err?.message || err)
    if (claimed && dedupe) {
      // libera para nova tentativa (ex.: próximo webhook)
      await db.execute('UPDATE subscriptions SET confirmation_email_sent_at = NULL WHERE id = ?', [subscriptionId]).catch(() => {})
    }
  }
}
