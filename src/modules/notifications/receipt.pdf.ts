// ============================================================
// receipt.pdf.ts — recibo de compra em PDF (SEM VALOR FISCAL)
// ============================================================
import PDFDocument from 'pdfkit'
import { PurchaseData, COMPANY, brl, dateBR, dateTimeBR } from './purchase.data'

export function buildReceiptPdf(d: PurchaseData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = 50
    const width = doc.page.width - 100
    const section = (title: string) => {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor('#5b3a29').text(title.toUpperCase(), left, doc.y)
      doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor('#d9c7b8').stroke()
      doc.moveDown(0.5).fillColor('#222').x = left
    }
    const row = (label: string, value: string) => {
      const y = doc.y
      doc.font('Helvetica').fontSize(10).fillColor('#666').text(label, left, y, { width: 170 })
      doc.font('Helvetica-Bold').fillColor('#222').text(value, left + 175, y, { width: width - 175 })
      doc.moveDown(0.3)
    }

    // Cabeçalho
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#5b3a29').text(`${COMPANY.name} | ${COMPANY.product}`)
    doc.font('Helvetica').fontSize(9).fillColor('#666')
    if (COMPANY.cnpj) doc.text(`CNPJ ${COMPANY.cnpj}`)
    if (COMPANY.address) doc.text(COMPANY.address)
    if (COMPANY.email) doc.text(COMPANY.email)

    doc.moveDown(1).font('Helvetica-Bold').fontSize(15).fillColor('#222').text('RECIBO DE COMPRA')
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#b00020')
      .text('COMPROVANTE SEM VALOR FISCAL. Não substitui nota fiscal.')

    section('Dados do recibo')
    row('Recibo nº', d.receiptNumber)
    row('Data do pagamento', dateTimeBR(d.paidAt))
    row('ID do pedido', d.externalReference)
    row('ID da assinatura', String(d.subscriptionId))
    row('Gateway de pagamento', d.gateway)

    section('Cliente')
    row('Estabelecimento', d.tenantName)
    row('E-mail', d.customerEmail)

    section('Plano contratado')
    row('Plano', d.planName)
    row('Ciclo de cobrança', d.cycleLabel)
    row('Desconto do ciclo', d.discountPct ? `${d.discountPct}%` : 'sem desconto')
    row('Mensalidade', brl(d.pricePerMonth))
    row('Período', `${d.totalMonths} ${d.totalMonths > 1 ? 'meses' : 'mês'}`)
    row('Vigência', `${dateBR(d.startedAt)}${d.expiresAt ? ' até ' + dateBR(d.expiresAt) : ' (renovação mensal)'}`)
    row('Recursos', d.planFeatures.join(', ') || '—')
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(13).fillColor('#222')
      .text(`TOTAL PAGO: ${brl(d.totalAmount)}`, left, doc.y)

    section('Condições principais do contrato')
    doc.font('Helvetica').fontSize(9.5).fillColor('#222')
    row('Contrato aceito', `versão ${d.contractVersion}, em ${dateTimeBR(d.contractAcceptedAt)}`)
    row('Arrependimento', `${d.arrependimentoDias} dias (até ${dateBR(d.arrependimentoAte)}), com reembolso integral`)
    row('Fidelidade', d.fidelity
      ? `${d.totalMonths} meses. Multa de ${d.multaFidelidadePct}% sobre as mensalidades vincendas em caso de rescisão antecipada`
      : 'sem fidelidade (cancelamento sem multa, acesso até o fim do ciclo pago)')
    row('Aviso prévio', '30 dias para cancelar a renovação automática')

    doc.moveDown(1.2).font('Helvetica').fontSize(8).fillColor('#888').text(
      'Este documento é um recibo de compra e não possui valor fiscal. O texto completo do contrato aceito ' +
      'está disponível no sistema. Em caso de dúvidas, entre em contato pelo e-mail ' + (COMPANY.email || 'de suporte') + '.',
      left, doc.y, { width }
    )
    doc.end()
  })
}
