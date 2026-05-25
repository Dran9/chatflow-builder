import { Bot } from 'grammy'
import { FlowEngine } from '../src/lib/engine'
import { loadWorkspace, findOrCreateContact, getContact, updateContactField, addTag, removeTag, logMessage, saveRun, updateContactRun } from './db'

export async function startTelegramBot(): Promise<Bot> {
  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) { console.warn('TELEGRAM_BOT_TOKEN no configurado'); return new Bot('') }

  const bot = new Bot(token)

  let workspaceData: Record<string, unknown> | null = null
  let engine: FlowEngine | null = null

  async function refreshEngine(): Promise<FlowEngine | null> {
    const ws = await loadWorkspace()
    if (!ws) return null
    workspaceData = ws

    const config = (ws.botConfig || {}) as Record<string, string>
    const sendFn = async (chatId: number, msg: any) => {
      if (typeof msg === 'string') {
        await bot.api.sendMessage(chatId, msg, { parse_mode: 'HTML' })
        return
      }
      switch (msg.type) {
        case 'text': await bot.api.sendMessage(chatId, msg.text, { parse_mode: 'HTML' }); break
        case 'image': await bot.api.sendPhoto(chatId, msg.url, msg.caption ? { caption: msg.caption } : {}); break
        case 'video': await bot.api.sendVideo(chatId, msg.url, msg.caption ? { caption: msg.caption } : {}); break
        case 'audio': await bot.api.sendAudio(chatId, msg.url); break
        case 'file': await bot.api.sendDocument(chatId, msg.url); break
        default: await bot.api.sendMessage(chatId, '[Contenido no soportado]')
      }
    }

    const eng = new (FlowEngine as any)(ws, {
      deepseekApiKey: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || '',
      groqApiKey: config.groqApiKey || process.env.GROQ_API_KEY || '',
    }, sendFn)

    // Override engine methods for MySQL persistence
    const origHandleEvent = eng.handleEvent.bind(eng)
    eng.handleEvent = async (event: any) => {
      const contact = await findOrCreateContact(event.telegramId, {
        firstName: event.firstName, lastName: event.lastName,
        username: event.username, languageCode: event.languageCode,
        isPremium: event.isPremium,
      })

      // Log incoming message
      if (event.type === 'message' && event.text) {
        await logMessage(event.telegramId, contact, 'in', event.text)
      }

      // Override internal methods for DB persistence
      const origGetContact = (eng as any).getContact.bind(eng)
      ;(eng as any).getContact = async (tgId: number) => {
        const c = await getContact(tgId)
        if (!c) return null
        return {
          id: `contact-${tgId}`,
          telegramId: tgId,
          firstName: c.first_name,
          lastName: c.last_name,
          username: c.username,
          languageCode: c.language_code,
          isPremium: c.is_premium,
          tags: typeof c.tags === 'string' ? JSON.parse(c.tags) : (c.tags || []),
          fields: typeof c.fields === 'string' ? JSON.parse(c.fields) : (c.fields || {}),
          currentFlowRunId: c.current_run_id,
          createdAt: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
          updatedAt: Date.now(),
        }
      }

      await origHandleEvent(event)

      // Save run state after execution
      const runState = (eng as any).getRunState
      const contactState = (eng as any).getContactState

      // Save tags and fields back to DB
      try {
        const cs = contactState ? contactState(event.telegramId) : null
        if (cs) {
          for (const [key, value] of Object.entries(cs.fields || {})) {
            await updateContactField(event.telegramId, key, value)
          }
        }
      } catch {}
    }

    engine = eng
    return eng
  }

  // Auto-refresh engine on first message and every 30 seconds
  setInterval(async () => {
    try { await refreshEngine() } catch {}
  }, 30000)

  bot.catch((err) => console.error('Bot error:', err.message))

  bot.command('start', async (ctx) => {
    const from = ctx.from
    if (!from) return
    await findOrCreateContact(from.id, {
      firstName: from.first_name, lastName: from.last_name,
      username: from.username, languageCode: from.language_code,
      isPremium: from.is_premium,
    })

    if (!engine && !(await refreshEngine())) {
      await ctx.reply('¡Hola! El bot está activo pero aún no tiene flows. Configúralos desde el builder.')
      return
    }

    try {
      await engine!.handleEvent({
        type: 'new_chat', telegramId: from.id,
        firstName: from.first_name, lastName: from.last_name,
        username: from.username, languageCode: from.language_code,
        isPremium: from.is_premium,
      })
    } catch (e) { console.error('/start error:', e) }
  })

  bot.command('help', async (ctx) => {
    await ctx.reply('/start - Iniciar\n/help - Ayuda\n/debug - Ver estado\n/reset - Reiniciar')
  })

  bot.command('debug', async (ctx) => {
    const from = ctx.from
    if (!from) return
    const c = await getContact(from.id)
    const ws = workspaceData as any
    const flows = ws?.flows || []
    let msg = `Contacto: id=${c?.id || '?'}, tags=${JSON.stringify(c?.tags || [])}\n\n`
    msg += `Workspace: ${ws?.name || 'sin nombre'} (${flows.length} flows)\n`
    for (const f of flows) {
      const triggers = f.nodes?.filter((n: any) => n.data?.type === 'trigger') || []
      for (const t of triggers) {
        msg += `  "${f.name}": trigger=${t.data?.triggerMethod} kw=${JSON.stringify(t.data?.triggerKeywords || [])}\n`
      }
    }
    await ctx.reply(msg)
  })

  bot.command('reset', async (ctx) => {
    engine = null
    workspaceData = null
    await ctx.reply('Reiniciado. Se recargará el workspace al siguiente mensaje.')
  })

  bot.on('message:text', async (ctx) => {
    const from = ctx.from
    if (!from) return

    await logMessage(from.id, 0, 'in', ctx.message.text)

    if (!engine && !(await refreshEngine())) {
      await ctx.reply('No hay flows cargados. Configúralos desde el builder y presiona Publicar.')
      return
    }

    try {
      await engine!.handleEvent({
        type: 'message', telegramId: from.id,
        firstName: from.first_name, lastName: from.last_name,
        username: from.username, languageCode: from.language_code,
        isPremium: from.is_premium, text: ctx.message.text,
      })
    } catch (e) {
      console.error('message error:', e)
      await ctx.reply('Ocurrió un error procesando tu mensaje. /debug para info.')
    }
  })

  bot.on('message:voice', async (ctx) => {
    const from = ctx.from
    if (!from) return
    if (!engine && !(await refreshEngine())) return
    try {
      await engine!.handleEvent({
        type: 'message', telegramId: from.id, firstName: from.first_name,
        text: '[mensaje de voz]', audioFileId: ctx.message.voice.file_id,
      })
    } catch {}
  })

  console.log('Telegram: Bot iniciado con long polling...')
  bot.start({
    onStart: (info) => console.log(`Telegram: @${info.username} conectado`),
  })

  return bot
}
