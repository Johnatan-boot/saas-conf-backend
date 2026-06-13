// ============================================================
// ifood.credentials.ts
// ⭐ CAMADA DE ABSTRAÇÃO — CHAVE DA UPGRADABILIDADE ⭐
//
// HOJE   (STEP 2 — per_tenant):
//   Cada confeitaria usa suas próprias credenciais iFood.
//   Custo: R$ 0. Limitação: cada loja gerencia seu próprio acesso.
//
// FUTURO (STEP 1 — master):
//   Você cadastra sua empresa como integradora no iFood.
//   Muda só IFOOD_INTEGRATION_MODE=master no .env.
//   Nenhum outro arquivo precisa mudar.
// ============================================================

import { db } from '../../../database/connection'

export type IntegrationMode = 'per_tenant' | 'master'

const MODE: IntegrationMode =
  (process.env.IFOOD_INTEGRATION_MODE as IntegrationMode) || 'per_tenant'

export interface IFoodCredentials {
  clientId: string
  clientSecret: string
  merchantId: string
}

export async function getIFoodCredentials(tenantId: number): Promise<IFoodCredentials> {
  if (MODE === 'master') {
    // ─── STEP 1 (futuro) ─────────────────────────────────────
    // Usa as credenciais da sua empresa integradora.
    // Cada confeitaria só precisa fornecer o merchantId dela.
    if (!process.env.IFOOD_MASTER_CLIENT_ID || !process.env.IFOOD_MASTER_CLIENT_SECRET) {
      throw new Error('Credenciais master iFood não configuradas no .env')
    }
    const [rows]: any = await db.execute(
      `SELECT merchant_id FROM tenant_integrations
       WHERE tenant_id = ? AND platform = 'ifood' AND is_active = 1`,
      [tenantId]
    )
    if (!rows.length) throw new Error('Loja não vinculada ao iFood')
    return {
      clientId: process.env.IFOOD_MASTER_CLIENT_ID,
      clientSecret: process.env.IFOOD_MASTER_CLIENT_SECRET,
      merchantId: rows[0].merchant_id,
    }
  }

  // ─── STEP 2 (agora) ────────────────────────────────────────
  // Cada confeitaria usa as próprias credenciais.
  const [rows]: any = await db.execute(
    `SELECT client_id, client_secret, merchant_id
     FROM tenant_integrations
     WHERE tenant_id = ? AND platform = 'ifood' AND is_active = 1`,
    [tenantId]
  )
  if (!rows.length) {
    throw new Error('iFood não configurado. Adicione suas credenciais em Integrações.')
  }
  return {
    clientId: rows[0].client_id,
    clientSecret: rows[0].client_secret,
    merchantId: rows[0].merchant_id,
  }
}

export function getIntegrationMode(): IntegrationMode {
  return MODE
}
