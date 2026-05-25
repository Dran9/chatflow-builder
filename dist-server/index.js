// server/index.ts
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv2 from "dotenv";

// server/db.ts
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
var pool = null;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || "localhost",
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "chatflow",
      port: parseInt(process.env.MYSQL_PORT || "3306"),
      waitForConnections: true,
      connectionLimit: 5
    });
  }
  return pool;
}
async function initDB() {
  const p = getPool();
  await p.execute(`
    CREATE TABLE IF NOT EXISTS workspace (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL DEFAULT 'Mi Bot',
      data JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
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
  `);
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
  `);
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
  `);
  console.log("DB: Tablas verificadas");
}
async function saveWorkspace(data) {
  const p = getPool();
  const json = JSON.stringify(data);
  const name = data.name || "Mi Bot";
  const [rows] = await p.execute("SELECT id FROM workspace LIMIT 1");
  if (rows.length > 0) {
    await p.execute("UPDATE workspace SET name = ?, data = ? WHERE id = ?", [name, json, rows[0].id]);
  } else {
    await p.execute("INSERT INTO workspace (name, data) VALUES (?, ?)", [name, json]);
  }
}
async function loadWorkspace() {
  const p = getPool();
  const [rows] = await p.execute("SELECT data FROM workspace ORDER BY updated_at DESC LIMIT 1");
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].data);
  } catch {
    return null;
  }
}
async function findOrCreateContact(tgId, data) {
  const p = getPool();
  const [existing] = await p.execute("SELECT id, tags, fields FROM contacts WHERE telegram_id = ?", [tgId]);
  if (existing.length > 0) {
    await p.execute(
      "UPDATE contacts SET first_name=?, last_name=?, username=?, language_code=?, is_premium=?, updated_at=NOW() WHERE telegram_id=?",
      [data.firstName || "", data.lastName || "", data.username || "", data.languageCode || "", data.isPremium || false, tgId]
    );
    return existing[0].id;
  }
  const [insert] = await p.execute(
    "INSERT INTO contacts (telegram_id, first_name, last_name, username, language_code, is_premium) VALUES (?,?,?,?,?,?)",
    [tgId, data.firstName || "", data.lastName || "", data.username || "", data.languageCode || "", data.isPremium || false]
  );
  return insert.insertId;
}
async function getContact(tgId) {
  const p = getPool();
  const [rows] = await p.execute("SELECT * FROM contacts WHERE telegram_id = ?", [tgId]);
  return rows.length > 0 ? rows[0] : null;
}
async function updateContactField(tgId, field, value) {
  const p = getPool();
  const [c] = await p.execute("SELECT fields FROM contacts WHERE telegram_id = ?", [tgId]);
  if (c.length === 0) return;
  const fields = typeof c[0].fields === "string" ? JSON.parse(c[0].fields) : c[0].fields || {};
  if (value === null || value === void 0) {
    delete fields[field];
  } else {
    fields[field] = value;
  }
  await p.execute("UPDATE contacts SET fields = ? WHERE telegram_id = ?", [JSON.stringify(fields), tgId]);
}
async function logMessage(tgId, contactId, direction, text, flowId, stepId) {
  const p = getPool();
  await p.execute(
    "INSERT INTO conversation_logs (contact_id, telegram_id, direction, message, flow_id, step_id) VALUES (?,?,?,?,?,?)",
    [contactId, tgId, direction, text, flowId || null, stepId || null]
  );
}

// server/bot.ts
import { Bot } from "grammy";

// src/lib/ai.ts
var DEEPSEEK_BASE = "https://api.deepseek.com/v1";
async function deepseekChat(apiKey, model, messages, temperature, maxTokens) {
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "deepseek-chat",
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0]?.message?.content || "";
}

// src/lib/engine.ts
var MAX_CONTINUOUS_STEPS = 30;
var FlowEngine = class {
  runs = /* @__PURE__ */ new Map();
  contacts = /* @__PURE__ */ new Map();
  workspace;
  config;
  sendFn;
  scheduler = [];
  constructor(workspace, config, sendFn) {
    this.workspace = workspace;
    this.config = config;
    this.sendFn = sendFn;
  }
  getFlow(id) {
    return this.workspace.flows.find((f) => f.id === id);
  }
  getNode(flow, id) {
    return flow.nodes.find((n) => n.id === id);
  }
  getEdgesFrom(flow, nodeId, handleId) {
    return flow.edges.filter((e) => e.source === nodeId && (handleId ? e.sourceHandle === handleId : true));
  }
  findNextNode(flow, currentNodeId, handleId) {
    const edges = this.getEdgesFrom(flow, currentNodeId, handleId);
    if (edges.length === 0) return void 0;
    const edge = edges[0];
    return this.getNode(flow, edge.target);
  }
  getContact(telegramId) {
    if (!this.contacts.has(telegramId)) {
      this.contacts.set(telegramId, {
        id: `contact-${telegramId}`,
        telegramId,
        firstName: "",
        tags: [],
        fields: {},
        currentFlowRunId: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    return this.contacts.get(telegramId);
  }
  updateContact(telegramId, updates) {
    const c = this.getContact(telegramId);
    Object.assign(c, updates, { updatedAt: Date.now() });
  }
  async handleEvent(event) {
    const contact = this.getContact(event.telegramId);
    if (event.firstName) contact.firstName = event.firstName;
    if (event.lastName !== void 0) contact.lastName = event.lastName;
    if (event.username !== void 0) contact.username = event.username;
    if (event.languageCode !== void 0) contact.languageCode = event.languageCode;
    if (event.isPremium !== void 0) contact.isPremium = event.isPremium;
    contact.updatedAt = Date.now();
    const existingRun = contact.currentFlowRunId ? this.runs.get(contact.currentFlowRunId) : void 0;
    if (existingRun && existingRun.status === "waiting_for_input") {
      if (event.text) {
        const node = this.getNodeFromRun(existingRun);
        if (node && node.data.inputSaveTo) {
          let value = event.text;
          const inputType = node.data.inputType || "text";
          if (inputType === "number") value = parseFloat(event.text);
          if (inputType === "date") value = event.text;
          contact.fields[node.data.inputSaveTo] = value;
        }
      }
      existingRun.status = "running";
      existingRun.updatedAt = Date.now();
      await this.executeRun(existingRun);
      return;
    }
    const matchingFlows = this.findMatchingTriggers(event);
    for (const flow of matchingFlows) {
      const triggerNode = flow.nodes.find((n) => n.data.type === "trigger");
      if (!triggerNode) continue;
      const run = {
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        contactId: contact.id,
        flowId: flow.id,
        currentNodeId: triggerNode.id,
        status: "running",
        context: {
          event,
          firstName: contact.firstName,
          lastName: contact.lastName,
          username: contact.username,
          languageCode: contact.languageCode
        },
        stepsExecuted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lockedUntil: null
      };
      this.runs.set(run.id, run);
      contact.currentFlowRunId = run.id;
      await this.executeRun(run);
    }
  }
  findMatchingTriggers(event) {
    return this.workspace.flows.filter((flow) => {
      const triggerNode = flow.nodes.find((n) => n.data.type === "trigger");
      if (!triggerNode) return false;
      const data = triggerNode.data;
      const method = data.triggerMethod || "keyword";
      switch (method) {
        case "keyword": {
          const keywords = data.triggerKeywords || [];
          if (!event.text) return false;
          return keywords.some((kw) => event.text.toLowerCase().includes(kw.toLowerCase()));
        }
        case "default_reply":
          return event.type === "message" && !this.findOtherMatchingFlow(event, flow.id);
        case "first_contact":
          return event.type === "new_chat";
        case "button_clicked":
          return event.callbackData === data.triggerButtonValue;
        default:
          return false;
      }
    });
  }
  findOtherMatchingFlow(event, excludeId) {
    return this.workspace.flows.some((flow) => {
      if (flow.id === excludeId) return false;
      const tn = flow.nodes.find((n) => n.data.type === "trigger");
      if (!tn) return false;
      const kw = tn.data.triggerKeywords || [];
      return kw.some((k) => event.text?.toLowerCase().includes(k.toLowerCase()));
    });
  }
  getNodeFromRun(run) {
    const flow = this.getFlow(run.flowId);
    return flow ? this.getNode(flow, run.currentNodeId) : void 0;
  }
  async executeRun(run) {
    while (run.status === "running") {
      if (run.stepsExecuted >= MAX_CONTINUOUS_STEPS) {
        run.status = "paused";
        break;
      }
      const node = this.getNodeFromRun(run);
      if (!node) {
        run.status = "completed";
        break;
      }
      run.stepsExecuted++;
      run.updatedAt = Date.now();
      const flow = this.getFlow(run.flowId);
      if (!flow) {
        run.status = "failed";
        break;
      }
      const contact = this.contacts.get(parseInt(run.contactId.replace("contact-", "")));
      if (!contact) {
        run.status = "failed";
        break;
      }
      const stepType = node.data.type;
      switch (stepType) {
        case "trigger": {
          const next = this.findNextNode(flow, node.id, "default");
          if (next) run.currentNodeId = next.id;
          else run.status = "completed";
          break;
        }
        case "send_message": {
          const messages = node.data.messages || [];
          const delay = node.data.typingDelay || 0;
          for (const msg of messages) {
            const rendered = this.renderMessage(msg, run.context);
            await this.sendFn(contact.telegramId, rendered);
            if (delay > 0) await this.sleep(delay);
          }
          const next = this.findNextNode(flow, node.id, "default");
          if (next) run.currentNodeId = next.id;
          else run.status = "completed";
          break;
        }
        case "user_input": {
          const prompt = node.data.inputPrompt;
          if (prompt) {
            const rendered = this.renderTemplate(prompt, run.context);
            await this.sendFn(contact.telegramId, rendered);
          }
          run.status = "waiting_for_input";
          break;
        }
        case "condition": {
          const branches = node.data.conditionBranches || [];
          let matchedBranchId;
          for (const branch of branches) {
            if (this.evaluateBranch(branch, contact)) {
              matchedBranchId = branch.id;
              break;
            }
          }
          const edges = this.getEdgesFrom(flow, node.id);
          const nextEdge = matchedBranchId ? edges.find((e) => e.sourceHandle === matchedBranchId) : edges[0];
          if (nextEdge) run.currentNodeId = nextEdge.target;
          else run.status = "completed";
          break;
        }
        case "action": {
          const actions = node.data.actions || [];
          for (const action of actions) {
            this.executeAction(action, contact);
          }
          const next = this.findNextNode(flow, node.id, "default");
          if (next) run.currentNodeId = next.id;
          else run.status = "completed";
          break;
        }
        case "smart_delay": {
          const ms = this.resolveDelay(node.data);
          if (ms > 0) {
            run.status = "waiting_until_time";
            run.lockedUntil = Date.now() + ms;
            this.scheduleResume(run, ms);
          } else {
            const next = this.findNextNode(flow, node.id, "default");
            if (next) run.currentNodeId = next.id;
            else run.status = "completed";
          }
          break;
        }
        case "randomizer": {
          const branches = node.data.randomizerBranches || [];
          const mode = node.data.randomizerMode || "even";
          let selectedBranchId;
          if (branches.length > 0) {
            if (mode === "even") {
              const idx = Math.floor(Math.random() * branches.length);
              selectedBranchId = branches[idx].id;
            } else {
              const total = branches.reduce((s, b) => s + b.weight, 0);
              let r = Math.random() * total;
              for (const b of branches) {
                r -= b.weight;
                if (r <= 0) {
                  selectedBranchId = b.id;
                  break;
                }
              }
              if (!selectedBranchId) selectedBranchId = branches[0].id;
            }
          }
          const edges = this.getEdgesFrom(flow, node.id);
          const nextEdge = selectedBranchId ? edges.find((e) => e.sourceHandle === selectedBranchId) : edges[0];
          if (nextEdge) run.currentNodeId = nextEdge.target;
          else run.status = "completed";
          break;
        }
        case "http_request": {
          let result = null;
          try {
            const method = node.data.httpMethod || "GET";
            const url = this.renderTemplate(node.data.httpUrl || "", run.context);
            const headers = {};
            const hdrs = node.data.httpHeaders || [];
            for (const h of hdrs) {
              if (h.key) headers[h.key] = h.value;
            }
            const res = await fetch(url, {
              method,
              headers: { "Content-Type": "application/json", ...headers },
              body: method !== "GET" ? this.renderTemplate(node.data.httpBody || "", run.context) : void 0
            });
            result = await res.text();
            if (node.data.httpSaveTo) {
              contact.fields[node.data.httpSaveTo] = result;
            }
          } catch (e) {
            result = null;
          }
          const next = this.findNextNode(flow, node.id, "default");
          if (next) run.currentNodeId = next.id;
          else run.status = "completed";
          break;
        }
        case "start_flow": {
          const targetId = node.data.targetFlowId;
          if (targetId) {
            const targetFlow = this.getFlow(targetId);
            if (targetFlow) {
              const newRun = {
                id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                contactId: run.contactId,
                flowId: targetId,
                currentNodeId: targetFlow.nodes.find((n) => n.data.type === "trigger")?.id || targetFlow.nodes[0]?.id || "",
                status: "running",
                context: run.context,
                stepsExecuted: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lockedUntil: null
              };
              this.runs.set(newRun.id, newRun);
              contact.currentFlowRunId = newRun.id;
              await this.executeRun(newRun);
              return;
            }
          }
          const next = this.findNextNode(flow, node.id, "default");
          if (next) run.currentNodeId = next.id;
          else run.status = "completed";
          break;
        }
        case "ai_response": {
          const provider = node.data.aiProvider || "deepseek";
          const model = node.data.aiModel || "deepseek-chat";
          const systemPrompt = node.data.aiSystemPrompt || "Eres un asistente \xFAtil.";
          const temp = node.data.aiTemperature ?? 0.7;
          const maxTokens = node.data.aiMaxTokens || 1e3;
          const contextMsgs = node.data.aiContextMessages || 5;
          if (provider === "deepseek" && this.config.deepseekApiKey) {
            try {
              const messages = [
                { role: "system", content: this.renderTemplate(systemPrompt, run.context) }
              ];
              const userMsg = run.context?.event?.text || "";
              messages.push({ role: "user", content: userMsg });
              const reply = await deepseekChat(
                this.config.deepseekApiKey,
                model,
                messages,
                temp,
                maxTokens
              );
              await this.sendFn(contact.telegramId, reply);
            } catch (e) {
              await this.sendFn(contact.telegramId, "Lo siento, no pude procesar tu mensaje en este momento.");
            }
          }
          const next = this.findNextNode(flow, node.id, "default");
          if (next) run.currentNodeId = next.id;
          else run.status = "completed";
          break;
        }
        case "comment": {
          const next = this.findNextNode(flow, node.id, "default");
          if (next) run.currentNodeId = next.id;
          else run.status = "completed";
          break;
        }
        default:
          run.status = "completed";
          break;
      }
    }
  }
  evaluateBranch(branch, contact) {
    if (!branch.rules || branch.rules.length === 0) return false;
    const results = branch.rules.map((rule) => this.evaluateRule(rule, contact));
    return branch.logic === "and" ? results.every(Boolean) : results.some(Boolean);
  }
  evaluateRule(rule, contact) {
    let leftValue;
    switch (rule.field.source) {
      case "tag":
        leftValue = contact.tags.includes(rule.field.name);
        break;
      case "custom_field":
        leftValue = contact.fields[rule.field.name];
        break;
      case "system":
        leftValue = contact[rule.field.name];
        break;
      default:
        leftValue = null;
    }
    const right = rule.value;
    switch (rule.operator) {
      case "equals":
        return String(leftValue) === right;
      case "not_equals":
        return String(leftValue) !== right;
      case "contains":
        return String(leftValue || "").toLowerCase().includes(right.toLowerCase());
      case "not_contains":
        return !String(leftValue || "").toLowerCase().includes(right.toLowerCase());
      case "greater_than":
        return parseFloat(String(leftValue)) > parseFloat(right);
      case "less_than":
        return parseFloat(String(leftValue)) < parseFloat(right);
      case "is_empty":
        return !leftValue || String(leftValue).trim() === "";
      case "is_not_empty":
        return !!leftValue && String(leftValue).trim() !== "";
      case "exists":
        return leftValue !== void 0 && leftValue !== null;
      case "not_exists":
        return leftValue === void 0 || leftValue === null;
      case "in_list": {
        const list = right.split(",").map((s) => s.trim());
        return list.includes(String(leftValue));
      }
      case "not_in_list": {
        const list = right.split(",").map((s) => s.trim());
        return !list.includes(String(leftValue));
      }
      case "starts_with":
        return String(leftValue || "").startsWith(right);
      case "ends_with":
        return String(leftValue || "").endsWith(right);
      case "date_before":
        return new Date(String(leftValue)) < new Date(right);
      case "date_after":
        return new Date(String(leftValue)) > new Date(right);
      case "date_between": {
        const [from, to] = right.split(",").map((s) => s.trim());
        const d = new Date(String(leftValue));
        return d >= new Date(from) && d <= new Date(to);
      }
      default:
        return false;
    }
  }
  executeAction(action, contact) {
    switch (action.type) {
      case "set_custom_field":
        contact.fields[action.params.name] = action.params.value;
        break;
      case "clear_custom_field":
        delete contact.fields[action.params.name];
        break;
      case "add_tag":
        if (!contact.tags.includes(action.params.name)) contact.tags.push(action.params.name);
        break;
      case "remove_tag":
        contact.tags = contact.tags.filter((t) => t !== action.params.name);
        break;
      case "mark_conversation_open":
        contact.fields["_conversation_status"] = "open";
        break;
      case "mark_conversation_closed":
        contact.fields["_conversation_status"] = "closed";
        break;
    }
  }
  renderMessage(msg, context) {
    if (msg.type === "text") {
      return this.renderTemplate(msg.text, context);
    }
    return msg;
  }
  renderTemplate(template, context) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(context[key] ?? "");
    });
  }
  resolveDelay(data) {
    if (data.delayValue && data.delayUnit) {
      const mult = data.delayUnit === "minutes" ? 6e4 : data.delayUnit === "hours" ? 36e5 : 864e5;
      return data.delayValue * mult;
    }
    return 0;
  }
  scheduleResume(run, ms) {
    const task = {
      runId: run.id,
      resumeAt: Date.now() + ms
    };
    this.scheduler.push(task);
    setTimeout(() => this.resumeRun(run.id), ms);
  }
  async resumeRun(runId) {
    const run = this.runs.get(runId);
    if (!run) return;
    if (run.status !== "waiting_until_time") return;
    const flow = this.getFlow(run.flowId);
    if (!flow) return;
    const node = this.getNode(flow, run.currentNodeId);
    if (!node) return;
    const next = this.findNextNode(flow, node.id, "default");
    if (next) run.currentNodeId = next.id;
    else run.status = "completed";
    run.status = "running";
    run.lockedUntil = null;
    await this.executeRun(run);
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  getContactState(telegramId) {
    return this.contacts.get(telegramId);
  }
  getRunState(runId) {
    return this.runs.get(runId);
  }
  getAllRuns() {
    return Array.from(this.runs.values());
  }
};

// server/bot.ts
async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN no configurado");
    return new Bot("");
  }
  const bot = new Bot(token);
  let workspaceData = null;
  let engine = null;
  async function refreshEngine() {
    const ws = await loadWorkspace();
    if (!ws) return null;
    workspaceData = ws;
    const config = ws.botConfig || {};
    const sendFn = async (chatId, msg) => {
      if (typeof msg === "string") {
        await bot.api.sendMessage(chatId, msg, { parse_mode: "HTML" });
        return;
      }
      switch (msg.type) {
        case "text":
          await bot.api.sendMessage(chatId, msg.text, { parse_mode: "HTML" });
          break;
        case "image":
          await bot.api.sendPhoto(chatId, msg.url, msg.caption ? { caption: msg.caption } : {});
          break;
        case "video":
          await bot.api.sendVideo(chatId, msg.url, msg.caption ? { caption: msg.caption } : {});
          break;
        case "audio":
          await bot.api.sendAudio(chatId, msg.url);
          break;
        case "file":
          await bot.api.sendDocument(chatId, msg.url);
          break;
        default:
          await bot.api.sendMessage(chatId, "[Contenido no soportado]");
      }
    };
    const eng = new FlowEngine(ws, {
      deepseekApiKey: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "",
      groqApiKey: config.groqApiKey || process.env.GROQ_API_KEY || ""
    }, sendFn);
    const origHandleEvent = eng.handleEvent.bind(eng);
    eng.handleEvent = async (event) => {
      const contact = await findOrCreateContact(event.telegramId, {
        firstName: event.firstName,
        lastName: event.lastName,
        username: event.username,
        languageCode: event.languageCode,
        isPremium: event.isPremium
      });
      if (event.type === "message" && event.text) {
        await logMessage(event.telegramId, contact, "in", event.text);
      }
      const origGetContact = eng.getContact.bind(eng);
      eng.getContact = async (tgId) => {
        const c = await getContact(tgId);
        if (!c) return null;
        return {
          id: `contact-${tgId}`,
          telegramId: tgId,
          firstName: c.first_name,
          lastName: c.last_name,
          username: c.username,
          languageCode: c.language_code,
          isPremium: c.is_premium,
          tags: typeof c.tags === "string" ? JSON.parse(c.tags) : c.tags || [],
          fields: typeof c.fields === "string" ? JSON.parse(c.fields) : c.fields || {},
          currentFlowRunId: c.current_run_id,
          createdAt: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
          updatedAt: Date.now()
        };
      };
      await origHandleEvent(event);
      const runState = eng.getRunState;
      const contactState = eng.getContactState;
      try {
        const cs = contactState ? contactState(event.telegramId) : null;
        if (cs) {
          for (const [key, value] of Object.entries(cs.fields || {})) {
            await updateContactField(event.telegramId, key, value);
          }
        }
      } catch {
      }
    };
    engine = eng;
    return eng;
  }
  setInterval(async () => {
    try {
      await refreshEngine();
    } catch {
    }
  }, 3e4);
  bot.catch((err) => console.error("Bot error:", err.message));
  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await findOrCreateContact(from.id, {
      firstName: from.first_name,
      lastName: from.last_name,
      username: from.username,
      languageCode: from.language_code,
      isPremium: from.is_premium
    });
    if (!engine && !await refreshEngine()) {
      await ctx.reply("\xA1Hola! El bot est\xE1 activo pero a\xFAn no tiene flows. Config\xFAralos desde el builder.");
      return;
    }
    try {
      await engine.handleEvent({
        type: "new_chat",
        telegramId: from.id,
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
        languageCode: from.language_code,
        isPremium: from.is_premium
      });
    } catch (e) {
      console.error("/start error:", e);
    }
  });
  bot.command("help", async (ctx) => {
    await ctx.reply("/start - Iniciar\n/help - Ayuda\n/debug - Ver estado\n/reset - Reiniciar");
  });
  bot.command("debug", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const c = await getContact(from.id);
    const ws = workspaceData;
    const flows = ws?.flows || [];
    let msg = `Contacto: id=${c?.id || "?"}, tags=${JSON.stringify(c?.tags || [])}

`;
    msg += `Workspace: ${ws?.name || "sin nombre"} (${flows.length} flows)
`;
    for (const f of flows) {
      const triggers = f.nodes?.filter((n) => n.data?.type === "trigger") || [];
      for (const t of triggers) {
        msg += `  "${f.name}": trigger=${t.data?.triggerMethod} kw=${JSON.stringify(t.data?.triggerKeywords || [])}
`;
      }
    }
    await ctx.reply(msg);
  });
  bot.command("reset", async (ctx) => {
    engine = null;
    workspaceData = null;
    await ctx.reply("Reiniciado. Se recargar\xE1 el workspace al siguiente mensaje.");
  });
  bot.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await logMessage(from.id, 0, "in", ctx.message.text);
    if (!engine && !await refreshEngine()) {
      await ctx.reply("No hay flows cargados. Config\xFAralos desde el builder y presiona Publicar.");
      return;
    }
    try {
      await engine.handleEvent({
        type: "message",
        telegramId: from.id,
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
        languageCode: from.language_code,
        isPremium: from.is_premium,
        text: ctx.message.text
      });
    } catch (e) {
      console.error("message error:", e);
      await ctx.reply("Ocurri\xF3 un error procesando tu mensaje. /debug para info.");
    }
  });
  bot.on("message:voice", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    if (!engine && !await refreshEngine()) return;
    try {
      await engine.handleEvent({
        type: "message",
        telegramId: from.id,
        firstName: from.first_name,
        text: "[mensaje de voz]",
        audioFileId: ctx.message.voice.file_id
      });
    } catch {
    }
  });
  console.log("Telegram: Bot iniciado con long polling...");
  bot.start({
    onStart: (info) => console.log(`Telegram: @${info.username} conectado`)
  });
  return bot;
}

// server/index.ts
dotenv2.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = parseInt(process.env.PORT || "3000");
app.use(cors());
app.use(express.json({ limit: "10mb" }));
var distPath = path.resolve(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("/api/status", async (_req, res) => {
  const ws = await loadWorkspace();
  const flows = ws?.flows || [];
  const flowInfo = flows.map((f) => ({
    name: f.name,
    id: f.id,
    isDefault: f.isDefault,
    triggers: (f.nodes || []).filter((n) => n.data?.type === "trigger").map((t) => ({
      method: t.data?.triggerMethod,
      keywords: t.data?.triggerKeywords
    }))
  }));
  res.json({
    ok: true,
    workspaceLoaded: !!ws,
    workspaceName: ws?.name || "sin nombre",
    flows: flowInfo,
    tokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
    dbConnected: true
  });
});
app.post("/api/publish", async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.flows) {
      return res.status(400).json({ ok: false, error: "Workspace inv\xE1lido" });
    }
    await saveWorkspace(data);
    console.log(`Workspace "${data.name}" guardado en MySQL`);
    res.json({
      ok: true,
      message: "Publicado correctamente en MySQL"
    });
  } catch (e) {
    console.error("Error publicando:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.post("/whatsapp-webhook", async (_req, res) => {
  res.json({ ok: true, message: "WhatsApp webhook endpoint listo" });
});
app.get("/whatsapp-webhook", async (_req, res) => {
  res.json({ ok: true, message: "WhatsApp webhook - GET" });
});
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
async function start() {
  try {
    await initDB();
    console.log("MySQL: Conectado y tablas listas");
  } catch (e) {
    console.warn("MySQL: No disponible, usando solo memoria. Error:", e);
  }
  startTelegramBot().catch((e) => console.error("Telegram no pudo iniciar:", e));
  app.listen(PORT, () => {
    console.log(`Servidor Express: http://localhost:${PORT}`);
  });
}
start();
var index_default = app;
export {
  index_default as default
};
