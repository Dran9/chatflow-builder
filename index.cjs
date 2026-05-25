// ── LOGGING: capturar TODO error ──
process.on('uncaughtException', (err) => console.error('FATAL:', err))
process.on('unhandledRejection', (err) => console.error('REJECTION:', err))

console.log('>>> Iniciando ChatFlow v3...')
console.log('>>> Node:', process.version)
console.log('>>> CWD:', process.cwd())
console.log('>>> PORT env:', process.env.PORT)
console.log('>>> TOKEN set:', !!process.env.TELEGRAM_BOT_TOKEN)
console.log('>>> MYSQL_HOST:', process.env.MYSQL_HOST || 'no definido')

const express = require('express')
const path = require('path')

// Health check ANTES de cualquier dependencia pesada
const app = express()
app.get('/health', (req, res) => res.send('OK'))
app.get('/api/status', (req, res) => res.json({ ok: true, time: Date.now() }))
app.use(express.static(path.join(__dirname, 'dist')))

// Puerto: Hostinger lo asigna, escuchar en 0.0.0.0
const PORT = process.env.PORT || 3000
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('>>> Express OK en puerto ' + PORT)
})

// ── Cargar módulos pesados DESPUÉS de que Express ya escucha ──
setTimeout(async () => {
  try {
    console.log('>>> Cargando Telegram Bot...')
    const { Bot } = require('grammy')
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) { console.log('>>> Telegram: sin token, bot no inicia'); return }

    const bot = new Bot(token)
    console.log('>>> Bot creado, configurando handlers...')

    bot.catch(err => console.error('>>> Bot error:', err.message))

    bot.command('start', async (ctx) => {
      console.log('>>> /start de', ctx.from?.id)
      await ctx.reply('¡Hola! El bot está activo. Escribe un mensaje.')
    })

    bot.command('test', async (ctx) => {
      await ctx.reply('Test OK - bot funcionando')
    })

    bot.on('message:text', async (ctx) => {
      console.log('>>> Mensaje recibido de', ctx.from?.id, ':', ctx.message.text)
      await ctx.reply('Recibido: ' + ctx.message.text + ' (Flow engine no procesado - revisa /test)')
    })

    console.log('>>> Iniciando long polling...')
    await bot.start({
      onStart: (info) => console.log('>>> Telegram conectado como @' + info.username),
    })
    console.log('>>> Long polling iniciado')
  } catch (e) {
    console.error('>>> Error cargando Telegram:', e.message)
    console.error('>>> Stack:', e.stack)
  }
}, 1000)

// ── MySQL opcional ──
setTimeout(async () => {
  try {
    console.log('>>> Intentando MySQL...')
    const mysql = require('mysql2/promise')
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'chatflow',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      connectTimeout: 5000,
    })
    const conn = await pool.getConnection()
    console.log('>>> MySQL: conectado OK')
    conn.release()
  } catch (e) {
    console.log('>>> MySQL: no disponible (' + e.message + ')')
  }
}, 2000)

console.log('>>> ChatFlow inicialización completa')
