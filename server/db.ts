import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

let pool: mysql.Pool | null = null

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'chatflow',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      waitForConnections: true,
      connectionLimit: 5,
    })
  }
  return pool
}

export async function initDB(): Promise<void> {
  const p = getPool()

  await p.execute(`
    CREATE TABLE IF NOT EXISTS workspace (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL DEFAULT 'Mi Bot',
      data JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await p.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      telegram_id BIGINT UNIQUE NOT NULL,
      first_name VARCHAR(255) DEFAULT '',
      last_name VARCHAR(255) DEFAULT '',
      username VARCHAR(255) DEFAULT '',
      language_code VARCHAR(10) DEFAULT '',
      is_premium BOOLEAN DEFAULT FALSE,
      tags JSON DEFAULT '[]',
      fields JSON DEFAULT '{}',
      current_run_id VARCHAR(100) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await p.execute(`
    CREATE TABLE IF NOT EXISTS conversation_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      contact_id INT NOT NULL,
      telegram_id BIGINT NOT NULL,
      direction ENUM('in', 'out') NOT NULL,
      message TEXT NOT NULL,
      flow_id VARCHAR(100) DEFAULT NULL,
      step_id VARCHAR(100) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await p.execute(`
    CREATE TABLE IF NOT EXISTS flow_runs (
      id VARCHAR(100) PRIMARY KEY,
      contact_id INT NOT NULL,
      flow_id VARCHAR(100) NOT NULL,
      current_node_id VARCHAR(100) NOT NULL,
      status ENUM('running','waiting_for_input','waiting_until_time','paused','completed','failed') DEFAULT 'running',
      context JSON DEFAULT '{}',
      steps_executed INT DEFAULT 0,
      locked_until BIGINT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  console.log('DB: Tablas verificadas')
}

export async function saveWorkspace(data: Record<string, unknown>): Promise<void> {
  const p = getPool()
  const json = JSON.stringify(data)
  const name = (data.name as string) || 'Mi Bot'

  const [rows] = await p.execute('SELECT id FROM workspace LIMIT 1') as any[]
  if (rows.length > 0) {
    await p.execute('UPDATE workspace SET name = ?, data = ? WHERE id = ?', [name, json, rows[0].id])
  } else {
    await p.execute('INSERT INTO workspace (name, data) VALUES (?, ?)', [name, json])
  }
}

export async function loadWorkspace(): Promise<Record<string, unknown> | null> {
  const p = getPool()
  const [rows] = await p.execute('SELECT data FROM workspace ORDER BY updated_at DESC LIMIT 1') as any[]
  if (rows.length === 0) return null
  try {
    return JSON.parse(rows[0].data)
  } catch { return null }
}

// Contactos
export async function findOrCreateContact(tgId: number, data: {
  firstName?: string; lastName?: string; username?: string
  languageCode?: string; isPremium?: boolean
}): Promise<number> {
  const p = getPool()
  const [existing] = await p.execute('SELECT id, tags, fields FROM contacts WHERE telegram_id = ?', [tgId]) as any[]
  if (existing.length > 0) {
    await p.execute(
      'UPDATE contacts SET first_name=?, last_name=?, username=?, language_code=?, is_premium=?, updated_at=NOW() WHERE telegram_id=?',
      [data.firstName || '', data.lastName || '', data.username || '', data.languageCode || '', data.isPremium || false, tgId]
    )
    return existing[0].id
  }
  const [insert] = await p.execute(
    'INSERT INTO contacts (telegram_id, first_name, last_name, username, language_code, is_premium) VALUES (?,?,?,?,?,?)',
    [tgId, data.firstName || '', data.lastName || '', data.username || '', data.languageCode || '', data.isPremium || false]
  ) as any
  return insert.insertId
}

export async function getContact(tgId: number): Promise<any | null> {
  const p = getPool()
  const [rows] = await p.execute('SELECT * FROM contacts WHERE telegram_id = ?', [tgId]) as any[]
  return rows.length > 0 ? rows[0] : null
}

export async function updateContactField(tgId: number, field: string, value: unknown): Promise<void> {
  const p = getPool()
  const [c] = await p.execute('SELECT fields FROM contacts WHERE telegram_id = ?', [tgId]) as any[]
  if (c.length === 0) return
  const fields = typeof c[0].fields === 'string' ? JSON.parse(c[0].fields) : (c[0].fields || {})
  if (value === null || value === undefined) {
    delete fields[field]
  } else {
    fields[field] = value
  }
  await p.execute('UPDATE contacts SET fields = ? WHERE telegram_id = ?', [JSON.stringify(fields), tgId])
}

export async function addTag(tgId: number, tag: string): Promise<void> {
  const p = getPool()
  const [c] = await p.execute('SELECT tags FROM contacts WHERE telegram_id = ?', [tgId]) as any[]
  if (c.length === 0) return
  const tags: string[] = typeof c[0].tags === 'string' ? JSON.parse(c[0].tags) : (c[0].tags || [])
  if (!tags.includes(tag)) tags.push(tag)
  await p.execute('UPDATE contacts SET tags = ? WHERE telegram_id = ?', [JSON.stringify(tags), tgId])
}

export async function removeTag(tgId: number, tag: string): Promise<void> {
  const p = getPool()
  const [c] = await p.execute('SELECT tags FROM contacts WHERE telegram_id = ?', [tgId]) as any[]
  if (c.length === 0) return
  const tags: string[] = typeof c[0].tags === 'string' ? JSON.parse(c[0].tags) : (c[0].tags || [])
  await p.execute('UPDATE contacts SET tags = ? WHERE telegram_id = ?', [JSON.stringify(tags.filter(t => t !== tag)), tgId])
}

// Logs
export async function logMessage(tgId: number, contactId: number, direction: 'in' | 'out', text: string, flowId?: string, stepId?: string): Promise<void> {
  const p = getPool()
  await p.execute(
    'INSERT INTO conversation_logs (contact_id, telegram_id, direction, message, flow_id, step_id) VALUES (?,?,?,?,?,?)',
    [contactId, tgId, direction, text, flowId || null, stepId || null]
  )
}

// Flow runs
export async function saveRun(run: {
  id: string; contactId: number; flowId: string; currentNodeId: string
  status: string; context: Record<string, unknown>
  stepsExecuted: number; lockedUntil: number | null
}): Promise<void> {
  const p = getPool()
  await p.execute(
    `INSERT INTO flow_runs (id, contact_id, flow_id, current_node_id, status, context, steps_executed, locked_until)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE current_node_id=?, status=?, context=?, steps_executed=?, locked_until=?, updated_at=NOW()`,
    [run.id, run.contactId, run.flowId, run.currentNodeId, run.status, JSON.stringify(run.context), run.stepsExecuted, run.lockedUntil,
     run.currentNodeId, run.status, JSON.stringify(run.context), run.stepsExecuted, run.lockedUntil]
  )
}

export async function updateContactRun(tgId: number, runId: string | null): Promise<void> {
  const p = getPool()
  await p.execute('UPDATE contacts SET current_run_id = ? WHERE telegram_id = ?', [runId, tgId])
}
