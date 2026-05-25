import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { initDB, saveWorkspace, loadWorkspace } from './db'
import { startTelegramBot } from './bot'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = parseInt(process.env.PORT || '3000')

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Servir frontend compilado
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

// --- API ---

// GET /api/status
app.get('/api/status', async (_req, res) => {
  const ws = await loadWorkspace()
  const flows = (ws as any)?.flows || []
  const flowInfo = flows.map((f: any) => ({
    name: f.name, id: f.id, isDefault: f.isDefault,
    triggers: (f.nodes || []).filter((n: any) => n.data?.type === 'trigger').map((t: any) => ({
      method: t.data?.triggerMethod, keywords: t.data?.triggerKeywords,
    })),
  }))

  res.json({
    ok: true,
    workspaceLoaded: !!ws,
    workspaceName: (ws as any)?.name || 'sin nombre',
    flows: flowInfo,
    tokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
    dbConnected: true,
  })
})

// POST /api/publish
app.post('/api/publish', async (req, res) => {
  try {
    const data = req.body
    if (!data || !data.flows) {
      return res.status(400).json({ ok: false, error: 'Workspace inválido' })
    }
    await saveWorkspace(data)
    console.log(`Workspace "${data.name}" guardado en MySQL`)

    res.json({
      ok: true,
      message: 'Publicado correctamente en MySQL',
    })
  } catch (e: any) {
    console.error('Error publicando:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// WhatsApp webhook placeholder (para después)
app.post('/whatsapp-webhook', async (_req, res) => {
  res.json({ ok: true, message: 'WhatsApp webhook endpoint listo' })
})

app.get('/whatsapp-webhook', async (_req, res) => {
  res.json({ ok: true, message: 'WhatsApp webhook - GET' })
})

// Fallback: servir index.html para React Router
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// --- Iniciar ---
async function start() {
  try {
    await initDB()
    console.log('MySQL: Conectado y tablas listas')
  } catch (e) {
    console.warn('MySQL: No disponible, usando solo memoria. Error:', e)
  }

  // Telegram bot (long polling, sin webhook)
  startTelegramBot().catch(e => console.error('Telegram no pudo iniciar:', e))

  app.listen(PORT, () => {
    console.log(`Servidor Express: http://localhost:${PORT}`)
  })
}

start()

export default app
