const express = require('express')
const path = require('path')
const { Bot } = require('grammy')
const mysql = require('mysql2/promise')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, 'dist')))

// ── MySQL ──
let pool = null
async function getPool() {
  if (pool) return pool
  try {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'chatflow',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      waitForConnections: true, connectionLimit: 5,
    })
    const p = pool
    await p.execute(`CREATE TABLE IF NOT EXISTS workspace (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) DEFAULT 'Mi Bot', data JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`)
    await p.execute(`CREATE TABLE IF NOT EXISTS contacts (id INT PRIMARY KEY AUTO_INCREMENT, telegram_id BIGINT UNIQUE NOT NULL, first_name VARCHAR(255) DEFAULT '', tags JSON DEFAULT '[]', fields JSON DEFAULT '{}', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`)
    console.log('MySQL conectado')
  } catch (e) {
    console.warn('MySQL no disponible:', e.message)
    pool = null
  }
  return pool
}

async function saveWorkspace(data) {
  const p = await getPool()
  if (!p) return
  const json = JSON.stringify(data)
  const [rows] = await p.execute('SELECT id FROM workspace LIMIT 1')
  if (rows.length > 0) await p.execute('UPDATE workspace SET name=?, data=? WHERE id=?', [data.name || 'Mi Bot', json, rows[0].id])
  else await p.execute('INSERT INTO workspace (name, data) VALUES (?,?)', [data.name || 'Mi Bot', json])
}

async function loadWorkspace() {
  const p = await getPool()
  if (!p) return null
  const [rows] = await p.execute('SELECT data FROM workspace ORDER BY updated_at DESC LIMIT 1')
  if (rows.length === 0) return null
  return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data
}

// ── Flow Engine (versión minimalista CommonJS) ──
function createEngine(workspace) {
  const flows = workspace.flows || []

  function findTriggerFlow(text) {
    for (const flow of flows) {
      const triggerNode = flow.nodes.find(n => n.data && n.data.type === 'trigger')
      if (!triggerNode) continue
      const method = triggerNode.data.triggerMethod || 'keyword'
      if (method === 'keyword') {
        const keywords = triggerNode.data.triggerKeywords || []
        if (keywords.some(kw => (text || '').toLowerCase().includes(kw.toLowerCase()))) {
          return { flow, triggerNode }
        }
      }
      if (method === 'default_reply') return { flow, triggerNode }
    }
    return null
  }

  function findNextNode(flow, nodeId) {
    const edge = flow.edges.find(e => e.source === nodeId)
    if (!edge) return null
    return flow.nodes.find(n => n.id === edge.target) || null
  }

  async function executeFlow(flow, startNodeId, ctx) {
    let nodeId = startNodeId
    let steps = 0
    const MAX = 30

    while (steps < MAX) {
      const node = flow.nodes.find(n => n.id === nodeId)
      if (!node) break

      steps++
      const data = node.data || {}
      const type = data.type

      if (type === 'trigger') {
        const next = findNextNode(flow, nodeId)
        if (next) nodeId = next.id
        else break
        continue
      }

      if (type === 'send_message') {
        const messages = data.messages || []
        for (const msg of messages) {
          if (msg.type === 'text' && msg.text) {
            const text = msg.text.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] || '')
            await ctx.reply(text)
          }
        }
        const next = findNextNode(flow, nodeId)
        if (next) nodeId = next.id
        else break
        continue
      }

      if (type === 'comment') {
        const next = findNextNode(flow, nodeId)
        if (next) nodeId = next.id
        else break
        continue
      }

      if (type === 'condition') {
        const branches = data.conditionBranches || []
        // Por ahora, tomar la primera rama
        const edge = flow.edges.find(e => e.source === nodeId)
        if (edge) nodeId = edge.target
        else break
        continue
      }

      if (type === 'action') {
        const next = findNextNode(flow, nodeId)
        if (next) nodeId = next.id
        else break
        continue
      }

      if (type === 'smart_delay') {
        const delayMs = (data.delayValue || 0) * ((data.delayUnit === 'hours' ? 3600 : data.delayUnit === 'days' ? 86400 : 60) * 1000)
        if (delayMs > 0) await new Promise(r => setTimeout(r, Math.min(delayMs, 5000)))
        const next = findNextNode(flow, nodeId)
        if (next) nodeId = next.id
        else break
        continue
      }

      if (type === 'ai_response') {
        const apiKey = data.aiProvider === 'deepseek' ? (process.env.DEEPSEEK_API_KEY || workspace.botConfig?.deepseekApiKey) : null
        if (apiKey) {
          try {
            const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
              body: JSON.stringify({
                model: data.aiModel || 'deepseek-chat',
                messages: [
                  { role: 'system', content: data.aiSystemPrompt || 'Eres un asistente útil.' },
                  { role: 'user', content: ctx.text || '' },
                ],
                temperature: data.aiTemperature || 0.7,
                max_tokens: data.aiMaxTokens || 1000,
              }),
            })
            const json = await res.json()
            const reply = json.choices?.[0]?.message?.content || 'Sin respuesta'
            await ctx.reply(reply)
          } catch (e) {
            await ctx.reply('Error al conectar con IA')
          }
        }
        const next = findNextNode(flow, nodeId)
        if (next) nodeId = next.id
        else break
        continue
      }

      break
    }
  }

  return { findTriggerFlow, executeFlow }
}

// ── Telegram Bot (long polling) ──
async function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) { console.warn('TELEGRAM_BOT_TOKEN no configurado'); return }

  const bot = new Bot(token)

  bot.catch(err => console.error('Bot error:', err.message))

  bot.command('start', async (ctx) => {
    await ctx.reply('¡Hola! Escribe "ayuda" o una palabra clave de tus flows.')
  })

  bot.command('ayuda', async (ctx) => {
    const ws = await loadWorkspace()
    if (!ws) { await ctx.reply('Aún no has publicado ningún flow. Ve al builder y presiona Publicar.'); return }
    const flows = ws.flows || []
    let msg = 'Flows disponibles:\n'
    for (const f of flows) {
      const trigger = f.nodes?.find(n => n.data?.type === 'trigger')
      if (trigger) {
        msg += `• ${f.name} → ${trigger.data.triggerMethod === 'keyword' ? 'palabras: ' + (trigger.data.triggerKeywords || []).join(', ') : trigger.data.triggerMethod}\n`
      }
    }
    await ctx.reply(msg)
  })

  bot.command('debug', async (ctx) => {
    const ws = await loadWorkspace()
    if (!ws) { await ctx.reply('Workspace: vacío'); return }
    const flows = ws.flows || []
    let msg = `✅ Workspace "${ws.name}" con ${flows.length} flows\n`
    for (const f of flows) {
      const triggers = f.nodes?.filter(n => n.data?.type === 'trigger') || []
      const msgs = f.nodes?.filter(n => n.data?.type === 'send_message') || []
      msg += `  "${f.name}": ${triggers.length} triggers, ${msgs.length} mensajes\n`
    }
    await ctx.reply(msg)
  })

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    const ws = await loadWorkspace()
    if (!ws) { await ctx.reply('El bot no tiene flows. Publica desde el builder.'); return }

    const engine = createEngine(ws)
    const match = engine.findTriggerFlow(text)

    if (match) {
      await engine.executeFlow(match.flow, match.triggerNode.id, {
        reply: (t) => ctx.reply(t),
        text,
        firstName: ctx.from?.first_name || '',
      })
    } else {
      await ctx.reply('No encontré un flow para ese mensaje. Escribe /ayuda para ver qué palabras clave están activas.')
    }
  })

  console.log('Telegram: iniciando long polling...')
  bot.start({ onStart: (info) => console.log('Telegram: @' + info.username + ' conectado') })
}

// ── API ──
app.get('/api/status', async (req, res) => {
  const ws = await loadWorkspace()
  res.json({
    ok: true,
    workspaceLoaded: !!ws,
    workspaceName: ws?.name || '',
    flows: (ws?.flows || []).length,
    tokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
  })
})

app.post('/api/publish', async (req, res) => {
  try {
    await saveWorkspace(req.body)
    console.log('Workspace publicado:', req.body.name)
    res.json({ ok: true, message: 'Publicado en MySQL' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Fallback SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// ── Iniciar ──
async function start() {
  await getPool()
  startBot()
  app.listen(PORT, () => console.log('ChatFlow corriendo en puerto ' + PORT))
}

start()
