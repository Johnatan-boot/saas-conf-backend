// Uso: npm run mail:test -- seu@email.com
// Envia um e-mail de confirmação de compra FICTÍCIO para validar o SMTP
// e o layout do recibo, sem precisar fazer pagamento.
import 'dotenv/config'
import { sendPurchaseEmailFor } from '../modules/notifications/purchase-email.service'
import { isMailConfigured } from '../modules/notifications/mailer.service'
import { PurchaseData } from '../modules/notifications/purchase.data'

async function main() {
  const to = process.argv[2]
  if (!to) { console.error('Informe o e-mail: npm run mail:test -- seu@email.com'); process.exit(1) }
  if (!isMailConfigured()) { console.error('SMTP não configurado: defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no .env'); process.exit(1) }

  const now = new Date()
  const ate = new Date(now); ate.setDate(ate.getDate() + 7)
  const exp = new Date(now); exp.setMonth(exp.getMonth() + 12)
  const sample: PurchaseData = {
    receiptNumber: `REC-${now.getFullYear()}-TESTE`, subscriptionId: 0,
    externalReference: 'sub_0_TESTE', gateway: 'Pagar.me', paidAt: now,
    customerName: 'Confeitaria de Teste', customerEmail: to, tenantName: 'Confeitaria de Teste',
    planName: 'Standard', planFeatures: ['até 5 usuários', 'até 200 produtos', 'até 300 pedidos/mês'],
    cycleLabel: '12 meses', discountPct: 10, fidelity: true, totalMonths: 12,
    pricePerMonth: 89.91, totalAmount: 1078.92,
    startedAt: now.toISOString().split('T')[0], expiresAt: exp.toISOString().split('T')[0],
    contractVersion: '2.0', contractAcceptedAt: now,
    multaFidelidadePct: 20, arrependimentoDias: 7, arrependimentoAte: ate,
  }
  await sendPurchaseEmailFor(sample)
  console.log(`✅ E-mail de teste enviado para ${to}`)
  process.exit(0)
}
main().catch(e => { console.error('❌ Falha:', e.message); process.exit(1) })
