import { db } from '../../database/connection'

// ── Types ─────────────────────────────────────────────────────────────────
interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; first_name: string; username?: string }
    chat: { id: number; type: string }
    text?: string
    date: number
  }
  callback_query?: {
    id: string
    from: { id: number; first_name: string }
    message: { chat: { id: number }; message_id: number }
    data?: string
  }
}

interface UserSession {
  tenantId?: number
  tenantSlug?: string
  tenantName?: string
  step?: string
  pendingOrder?: any
  lastActivity: number
}

// ── Session store (in-memory, suficiente para MVP) ─────────────────────────
const sessions = new Map<number, UserSession>()

function getSession(chatId: number): UserSession {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { lastActivity: Date.now() })
  }
  const s = sessions.get(chatId)!
  s.lastActivity = Date.now()
  return s
}

// ── Telegram API helper ────────────────────────────────────────────────────
async function sendTelegram(token: string, chatId: number, text: string, extra?: any) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  })
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

// ── Keyboard builders ──────────────────────────────────────────────────────
function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📦 Meus Pedidos', callback_data: 'menu_orders' },
        { text: '🛒 Novo Pedido', callback_data: 'menu_new_order' },
      ],
      [
        { text: '💰 Pagamentos', callback_data: 'menu_payments' },
        { text: '📊 Resumo do Dia', callback_data: 'menu_summary' },
      ],
      [
        { text: '🏪 Trocar Confeitaria', callback_data: 'menu_switch' },
        { text: '❓ Ajuda', callback_data: 'menu_help' },
      ],
    ],
  }
}

function orderStatusKeyboard(orderId: number) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirmar', callback_data: `status_${orderId}_confirmed` },
        { text: '🔧 Em Produção', callback_data: `status_${orderId}_in_production` },
      ],
      [
        { text: '🎁 Pronto', callback_data: `status_${orderId}_ready` },
        { text: '🚚 Entregue', callback_data: `status_${orderId}_delivered` },
      ],
      [{ text: '🔙 Voltar', callback_data: 'menu_orders' }],
    ],
  }
}

// ── DB helpers ─────────────────────────────────────────────────────────────
async function findTenantBySlug(slug: string) {
  const [rows]: any = await db.execute(
    'SELECT id, name, slug FROM tenants WHERE slug = ? LIMIT 1',
    [slug]
  )
  return rows[0] || null
}

async function getRecentOrders(tenantId: number, limit = 5) {
  const [rows]: any = await db.execute(
    `SELECT o.id, o.code, o.status, o.total, o.delivery_date, c.name as client_name
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.tenant_id = ?
     ORDER BY o.created_at DESC
     LIMIT ?`,
    [tenantId, limit]
  )
  return rows
}

async function getOrderById(tenantId: number, orderId: number) {
  const [rows]: any = await db.execute(
    `SELECT o.*, c.name as client_name, c.phone as client_phone
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.id = ? AND o.tenant_id = ? LIMIT 1`,
    [orderId, tenantId]
  )
  if (!rows[0]) return null
  const [items]: any = await db.execute(
    'SELECT product_name, quantity, unit_price, total_price FROM order_items WHERE order_id = ?',
    [orderId]
  )
  return { ...rows[0], items }
}

async function updateOrderStatus(tenantId: number, orderId: number, status: string) {
  await db.execute(
    'UPDATE orders SET status = ? WHERE id = ? AND tenant_id = ?',
    [status, orderId, tenantId]
  )
}

async function getDailySummary(tenantId: number) {
  const today = new Date().toISOString().split('T')[0]
  const [revenue]: any = await db.execute(
    `SELECT COUNT(*) as total_orders,
            COALESCE(SUM(total),0) as revenue,
            COALESCE(SUM(CASE WHEN status='delivered' THEN total END),0) as delivered_revenue
     FROM orders WHERE tenant_id=? AND DATE(created_at)=?`,
    [tenantId, today]
  )
  const [pending]: any = await db.execute(
    `SELECT COUNT(*) as cnt FROM orders WHERE tenant_id=? AND status IN ('pending','confirmed','in_production','ready')`,
    [tenantId]
  )
  return { ...revenue[0], pending_orders: pending[0].cnt }
}

async function getProducts(tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT id, name, price FROM products WHERE tenant_id=? AND is_active=1 LIMIT 10',
    [tenantId]
  )
  return rows
}

async function getClients(tenantId: number) {
  const [rows]: any = await db.execute(
    'SELECT id, name, phone FROM clients WHERE tenant_id=? ORDER BY name LIMIT 10',
    [tenantId]
  )
  return rows
}

// ── Status labels ──────────────────────────────────────────────────────────
const STATUS_EMOJI: Record<string, string> = {
  pending: '⏳ Pendente',
  confirmed: '✅ Confirmado',
  in_production: '🔧 Em Produção',
  ready: '🎁 Pronto',
  delivered: '🚚 Entregue',
  cancelled: '❌ Cancelado',
}

// ── AI response (Anthropic) ────────────────────────────────────────────────
async function getAIResponse(userMessage: string, context: string, apiKey: string): Promise<string> {
  if (!apiKey) return ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `Você é um assistente de confeitaria simpático e eficiente chamado Docinho 🍰.
Responda em português brasileiro, de forma breve e prática.
Contexto da confeitaria: ${context}
Responda perguntas sobre pedidos, produtos, preços e dicas de confeitaria.
Se não souber algo específico, redirecione para o menu principal.
Máximo 3 frases por resposta.`,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
    const data: any = await res.json()
    return data.content?.[0]?.text || ''
  } catch {
    return ''
  }
}

// ── Main message handler ───────────────────────────────────────────────────
export async function handleTelegramUpdate(update: TelegramUpdate, token: string, anthropicApiKey: string) {
  // Handle callback queries (button clicks)
  if (update.callback_query) {
    const cb = update.callback_query
    const chatId = cb.message.chat.id
    const data = cb.data || ''
    const session = getSession(chatId)

    await answerCallbackQuery(token, cb.id)

    // ── Main menu actions ────────────────────────────────────────────────
    if (data === 'menu_orders') {
      if (!session.tenantId) {
        await sendTelegram(token, chatId, '⚠️ Primeiro configure sua confeitaria. Use /start')
        return
      }
      const orders = await getRecentOrders(session.tenantId)
      if (!orders.length) {
        await sendTelegram(token, chatId, '📭 Nenhum pedido encontrado ainda.', {
          reply_markup: mainMenuKeyboard(),
        })
        return
      }
      let text = '📦 <b>Últimos Pedidos</b>\n\n'
      const keyboard: any[] = []
      for (const o of orders) {
        const status = STATUS_EMOJI[o.status] || o.status
        const total = formatCurrency(Number(o.total))
        text += `<b>${o.code}</b> — ${o.client_name || 'Cliente avulso'}\n`
        text += `${status} • ${total}\n\n`
        keyboard.push([{ text: `📋 ${o.code}`, callback_data: `order_${o.id}` }])
      }
      keyboard.push([{ text: '🔙 Menu Principal', callback_data: 'menu_main' }])
      await sendTelegram(token, chatId, text, { reply_markup: { inline_keyboard: keyboard } })
      return
    }

    if (data === 'menu_summary') {
      if (!session.tenantId) {
        await sendTelegram(token, chatId, '⚠️ Primeiro configure sua confeitaria. Use /start')
        return
      }
      const s = await getDailySummary(session.tenantId)
      const text = `📊 <b>Resumo de Hoje — ${session.tenantName}</b>\n\n` +
        `🛒 Pedidos hoje: <b>${s.total_orders}</b>\n` +
        `💰 Faturamento: <b>${formatCurrency(Number(s.revenue))}</b>\n` +
        `✅ Receita entregue: <b>${formatCurrency(Number(s.delivered_revenue))}</b>\n` +
        `⏳ Em aberto: <b>${s.pending_orders} pedidos</b>\n\n` +
        `<i>Atualizado agora • ${new Date().toLocaleTimeString('pt-BR')}</i>`
      await sendTelegram(token, chatId, text, { reply_markup: mainMenuKeyboard() })
      return
    }

    if (data === 'menu_new_order') {
      if (!session.tenantId) {
        await sendTelegram(token, chatId, '⚠️ Primeiro configure sua confeitaria. Use /start')
        return
      }
      const products = await getProducts(session.tenantId)
      if (!products.length) {
        await sendTelegram(token, chatId, '📭 Nenhum produto cadastrado. Adicione produtos no sistema primeiro.', {
          reply_markup: mainMenuKeyboard(),
        })
        return
      }
      let text = '🛒 <b>Novo Pedido — Escolha o produto:</b>\n\n'
      const keyboard: any[] = []
      for (const p of products) {
        text += `• ${p.name} — ${formatCurrency(Number(p.price))}\n`
        keyboard.push([{ text: `🎂 ${p.name} — ${formatCurrency(Number(p.price))}`, callback_data: `product_${p.id}` }])
      }
      keyboard.push([{ text: '🔙 Voltar', callback_data: 'menu_main' }])
      await sendTelegram(token, chatId, text, { reply_markup: { inline_keyboard: keyboard } })
      session.step = 'choosing_product'
      return
    }

    if (data.startsWith('product_')) {
      const productId = parseInt(data.split('_')[1])
      if (!session.tenantId) return
      const [rows]: any = await db.execute(
        'SELECT id, name, price FROM products WHERE id=? AND tenant_id=?',
        [productId, session.tenantId]
      )
      const product = rows[0]
      if (!product) return
      session.pendingOrder = { product_id: product.id, product_name: product.name, unit_price: Number(product.price) }
      session.step = 'choosing_client'
      const clients = await getClients(session.tenantId)
      const keyboard: any[] = clients.map((c: any) => [
        { text: `👤 ${c.name}`, callback_data: `client_${c.id}` },
      ])
      keyboard.push([{ text: '👤 Cliente Avulso', callback_data: 'client_0' }])
      keyboard.push([{ text: '🔙 Voltar', callback_data: 'menu_new_order' }])
      await sendTelegram(token, chatId,
        `🎂 <b>${product.name}</b> selecionado!\n\n👤 Agora escolha o cliente:`,
        { reply_markup: { inline_keyboard: keyboard } }
      )
      return
    }

    if (data.startsWith('client_') && session.step === 'choosing_client') {
      const clientId = parseInt(data.split('_')[1])
      if (!session.tenantId || !session.pendingOrder) return
      const order = session.pendingOrder

      // Create order in DB
      const code = `TG-${Date.now()}`
      const total = order.unit_price
      const [r]: any = await db.execute(
        'INSERT INTO orders (tenant_id, client_id, code, status, subtotal, discount, total, delivery_type) VALUES (?,?,?,?,?,?,?,?)',
        [session.tenantId, clientId || null, code, 'pending', total, 0, total, 'pickup']
      )
      const orderId = r.insertId
      await db.execute(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price) VALUES (?,?,?,?,?,?)',
        [orderId, order.product_id, order.product_name, 1, order.unit_price, total]
      )

      session.step = undefined
      session.pendingOrder = undefined

      let clientName = 'Cliente avulso'
      if (clientId) {
        const [cr]: any = await db.execute('SELECT name FROM clients WHERE id=?', [clientId])
        clientName = cr[0]?.name || clientName
      }

      const text = `✅ <b>Pedido Criado com Sucesso!</b>\n\n` +
        `📋 Código: <b>${code}</b>\n` +
        `👤 Cliente: ${clientName}\n` +
        `🎂 Produto: ${order.product_name}\n` +
        `💰 Total: <b>${formatCurrency(total)}</b>\n` +
        `⏳ Status: Pendente\n\n` +
        `Acesse o sistema para detalhes completos.`
      await sendTelegram(token, chatId, text, { reply_markup: mainMenuKeyboard() })
      return
    }

    if (data.startsWith('order_')) {
      const orderId = parseInt(data.split('_')[1])
      if (!session.tenantId) return
      const order = await getOrderById(session.tenantId, orderId)
      if (!order) {
        await sendTelegram(token, chatId, '❌ Pedido não encontrado.')
        return
      }
      const status = STATUS_EMOJI[order.status] || order.status
      let text = `📋 <b>Pedido ${order.code}</b>\n\n` +
        `👤 Cliente: ${order.client_name || 'Avulso'}\n` +
        `${status}\n` +
        `💰 Total: <b>${formatCurrency(Number(order.total))}</b>\n`
      if (order.delivery_date) {
        text += `📅 Entrega: ${new Date(order.delivery_date).toLocaleDateString('pt-BR')}\n`
      }
      if (order.items?.length) {
        text += `\n🛒 <b>Itens:</b>\n`
        for (const item of order.items) {
          text += `• ${item.quantity}x ${item.product_name} — ${formatCurrency(Number(item.total_price))}\n`
        }
      }
      text += `\n<i>Alterar status:</i>`
      await sendTelegram(token, chatId, text, { reply_markup: orderStatusKeyboard(orderId) })
      return
    }

    if (data.startsWith('status_')) {
      const parts = data.split('_')
      const orderId = parseInt(parts[1])
      const newStatus = parts[2]
      if (!session.tenantId) return
      await updateOrderStatus(session.tenantId, orderId, newStatus)
      const statusLabel = STATUS_EMOJI[newStatus] || newStatus
      await sendTelegram(token, chatId,
        `✅ Status atualizado para <b>${statusLabel}</b>!`,
        { reply_markup: mainMenuKeyboard() }
      )
      return
    }

    if (data === 'menu_payments') {
      if (!session.tenantId) return
      const today = new Date().toISOString().split('T')[0]
      const [rows]: any = await db.execute(
        `SELECT p.amount, p.method, p.status, p.paid_at, o.code
         FROM payments p JOIN orders o ON o.id=p.order_id
         WHERE p.tenant_id=? AND DATE(p.created_at)=?
         ORDER BY p.created_at DESC LIMIT 5`,
        [session.tenantId, today]
      )
      if (!rows.length) {
        await sendTelegram(token, chatId, '💰 Nenhum pagamento registrado hoje.', {
          reply_markup: mainMenuKeyboard(),
        })
        return
      }
      let text = '💰 <b>Pagamentos de Hoje</b>\n\n'
      for (const p of rows) {
        const statusIcon = p.status === 'paid' ? '✅' : '⏳'
        text += `${statusIcon} ${p.code} — <b>${formatCurrency(Number(p.amount))}</b> (${p.method})\n`
      }
      await sendTelegram(token, chatId, text, { reply_markup: mainMenuKeyboard() })
      return
    }

    if (data === 'menu_switch') {
      sessions.delete(chatId)
      await sendTelegram(token, chatId,
        '🏪 Qual é o <b>slug</b> da sua confeitaria?\n\n<i>Ex: confeitaria-da-ana</i>\n\nDigite abaixo:'
      )
      return
    }

    if (data === 'menu_help') {
      const text = `❓ <b>Como usar o Docinho Bot</b>\n\n` +
        `📦 <b>Meus Pedidos</b> — Veja e gerencie pedidos recentes\n` +
        `🛒 <b>Novo Pedido</b> — Crie um pedido rápido\n` +
        `💰 <b>Pagamentos</b> — Veja recebimentos de hoje\n` +
        `📊 <b>Resumo do Dia</b> — Faturamento e métricas\n\n` +
        `💬 Ou simplesmente <b>escreva sua pergunta</b> e a IA responde!\n\n` +
        `<i>Comandos: /start /menu /ajuda</i>`
      await sendTelegram(token, chatId, text, { reply_markup: mainMenuKeyboard() })
      return
    }

    if (data === 'menu_main') {
      const session = getSession(chatId)
      await sendTelegram(token, chatId,
        `🏠 <b>Menu Principal — ${session.tenantName || 'Confeitaria'}</b>\n\nEscolha uma opção:`,
        { reply_markup: mainMenuKeyboard() }
      )
      return
    }

    return
  }

  // Handle text messages
  if (!update.message?.text) return

  const chatId = update.message.chat.id
  const text = update.message.text.trim()
  const firstName = update.message.from.first_name
  const session = getSession(chatId)

  // ── Commands ─────────────────────────────────────────────────────────────
  if (text === '/start' || text === '/menu') {
    if (session.tenantId) {
      await sendTelegram(token, chatId,
        `👋 Olá, <b>${firstName}</b>! Bem-vindo de volta à <b>${session.tenantName}</b> 🎂\n\nO que deseja fazer?`,
        { reply_markup: mainMenuKeyboard() }
      )
    } else {
      await sendTelegram(token, chatId,
        `🎂 Olá, <b>${firstName}</b>! Sou o <b>Docinho</b>, seu assistente de confeitaria!\n\n` +
        `Para começar, me diga o <b>slug</b> da sua confeitaria.\n\n` +
        `<i>Você encontra o slug na tela de configurações do sistema.</i>\n` +
        `<i>Exemplo: confeitaria-da-ana</i>\n\nDigite o slug abaixo:`
      )
      session.step = 'awaiting_slug'
    }
    return
  }

  if (text === '/ajuda' || text === '/help') {
    await sendTelegram(token, chatId,
      `❓ <b>Ajuda — Docinho Bot</b>\n\nDigite /start para começar\nOu escreva qualquer pergunta!`,
      { reply_markup: session.tenantId ? mainMenuKeyboard() : undefined }
    )
    return
  }

  // ── Awaiting slug ─────────────────────────────────────────────────────────
  if (!session.tenantId || session.step === 'awaiting_slug') {
    const slug = text.toLowerCase().replace(/\s+/g, '-')
    const tenant = await findTenantBySlug(slug)
    if (!tenant) {
      await sendTelegram(token, chatId,
        `❌ Confeitaria "<b>${slug}</b>" não encontrada.\n\nVerifique o slug nas configurações do sistema e tente novamente:`
      )
      session.step = 'awaiting_slug'
      return
    }
    session.tenantId = tenant.id
    session.tenantSlug = tenant.slug
    session.tenantName = tenant.name
    session.step = undefined
    await sendTelegram(token, chatId,
      `✅ <b>${tenant.name}</b> conectada com sucesso!\n\n🎉 Agora você pode gerenciar seus pedidos por aqui.\nO que deseja fazer?`,
      { reply_markup: mainMenuKeyboard() }
    )
    return
  }

  // ── AI fallback for free text ─────────────────────────────────────────────
  const context = `Confeitaria: ${session.tenantName}. Sistema de gestão de pedidos, clientes e produtos.`
  const aiResponse = await getAIResponse(text, context, anthropicApiKey)

  if (aiResponse) {
    await sendTelegram(token, chatId, aiResponse, { reply_markup: mainMenuKeyboard() })
  } else {
    await sendTelegram(token, chatId,
      `🤔 Não entendi bem. Use o menu abaixo para navegar:`,
      { reply_markup: mainMenuKeyboard() }
    )
  }
}

// ── Notification helpers (called from other services) ────────────────────
export async function notifyAllSessions(token: string, tenantId: number, message: string) {
  for (const [chatId, session] of sessions.entries()) {
    if (session.tenantId === tenantId) {
      await sendTelegram(token, chatId, message).catch(() => {})
    }
  }
}
