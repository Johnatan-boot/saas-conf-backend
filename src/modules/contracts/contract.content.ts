// ============================================================
// contract.content.ts
//
// Versão "fonte da verdade" do Contrato de Prestação de Serviços
// SaaS (Mastercode / SweetFlow), usada pelo backend apenas para validar/carimbar
// a versão aceita pelo cliente no cadastro (contract_acceptances).
// O TEXTO exibido ao usuário vive no frontend (mesma versão),
// para evitar round-trip antes do pagamento.
// ============================================================

export const CONTRACT_VERSION = '2.0'

export const CONTRACT_TITLE = 'Contrato de Prestação de Serviços de Software (SaaS) — Mastercode'
