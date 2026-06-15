// ============================================================
// theme.service.ts — compatível com mysql2 pool do projeto
// Usa db.execute() igual aos outros módulos do projeto
// ============================================================
import { db } from '../../database/connection'

export interface ThemeData {
  primaryColor?: string; secondaryColor?: string; backgroundColor?: string
  textColor?: string; cardColor?: string
  logoUrl?: string    // aceita base64 ou URL externa
  bannerUrl?: string  // banner do hero do catálogo (base64 ou URL)
  storeName?: string; tagline?: string; slug?: string
  aboutText?: string  // texto da seção "Sobre"
  address?: string    // endereço exibido em "Contato"
  instagram?: string; facebook?: string; whatsapp?: string; youtube?: string
}

export async function getTheme(tenantId: number) {
  const [rows]: any = await db.execute(
    `SELECT
       primary_color      AS primaryColor,
       secondary_color    AS secondaryColor,
       background_color   AS backgroundColor,
       text_color         AS textColor,
       card_color         AS cardColor,
       logo_url           AS logoUrl,
       banner_url         AS bannerUrl,
       store_name         AS storeName,
       tagline,
       about_text         AS aboutText,
       slug,
       address,
       instagram, facebook, whatsapp, youtube,
       updated_at         AS updatedAt
     FROM store_themes WHERE tenant_id = ?`,
    [tenantId]
  )

  if (!rows || rows.length === 0) {
    // Retorna defaults sem bater na tabela (caso ainda não configurado)
    return {
      primaryColor: '#6F4F37', secondaryColor: '#c4621d',
      backgroundColor: '#fffdf9', textColor: '#261c12',
      cardColor: '#ffffff', logoUrl: '', bannerUrl: '', storeName: '',
      tagline: '', aboutText: '', slug: '', address: '',
      instagram: '', facebook: '',
      whatsapp: '', youtube: '',
    }
  }
  return rows[0]
}

export async function saveTheme(tenantId: number, data: ThemeData) {
  const {
    primaryColor = '#6F4F37', secondaryColor = '#c4621d',
    backgroundColor = '#fffdf9', textColor = '#261c12',
    cardColor = '#ffffff', logoUrl = '', bannerUrl = '', storeName = '',
    tagline = '', aboutText = '', slug = '', address = '',
    instagram = '', facebook = '',
    whatsapp = '', youtube = '',
  } = data

  // Verifica slug único
  if (slug) {
    const [conflict]: any = await db.execute(
      'SELECT tenant_id FROM store_themes WHERE slug = ? AND tenant_id != ?',
      [slug, tenantId]
    )
    if (conflict && conflict.length > 0) {
      throw new Error('Este slug já está em uso por outra loja')
    }
  }

  await db.execute(
    `INSERT INTO store_themes
       (tenant_id, primary_color, secondary_color, background_color, text_color,
        card_color, logo_url, banner_url, store_name, tagline, about_text, slug, address,
        instagram, facebook, whatsapp, youtube)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       primary_color     = VALUES(primary_color),
       secondary_color   = VALUES(secondary_color),
       background_color  = VALUES(background_color),
       text_color        = VALUES(text_color),
       card_color        = VALUES(card_color),
       logo_url          = VALUES(logo_url),
       banner_url        = VALUES(banner_url),
       store_name        = VALUES(store_name),
       tagline           = VALUES(tagline),
       about_text        = VALUES(about_text),
       slug              = VALUES(slug),
       address           = VALUES(address),
       instagram         = VALUES(instagram),
       facebook          = VALUES(facebook),
       whatsapp          = VALUES(whatsapp),
       youtube           = VALUES(youtube),
       updated_at        = NOW()`,
    [tenantId, primaryColor, secondaryColor, backgroundColor, textColor,
     cardColor, logoUrl || null, bannerUrl || null, storeName || null, tagline || null,
     aboutText || null, slug || null, address || null, instagram || null, facebook || null,
     whatsapp || null, youtube || null]
  )

  return getTheme(tenantId)
}
