import type {
  Workspace, Flow, FlowNode, FlowEdge, StepData,
  FlowRun, ContactState, RunStatus, ConditionRule,
  TriggerMethod, MessageContent,
} from '@/types'
import { deepseekChat, groqTranscribe } from './ai'

const MAX_CONTINUOUS_STEPS = 30

interface EngineConfig {
  deepseekApiKey: string
  groqApiKey: string
}

export interface SendMessageFn {
  (chatId: number, content: MessageContent): Promise<void>
  (chatId: number, text: string): Promise<void>
}

export class FlowEngine {
  private runs: Map<string, FlowRun> = new Map()
  private contacts: Map<number, ContactState> = new Map()
  private workspace: Workspace
  private config: EngineConfig
  private sendFn: (chatId: number, msg: MessageContent | string) => Promise<void>
  private scheduler: ScheduledTask[] = []

  constructor(workspace: Workspace, config: EngineConfig, sendFn: (chatId: number, msg: MessageContent | string) => Promise<void>) {
    this.workspace = workspace
    this.config = config
    this.sendFn = sendFn
  }

  private getFlow(id: string): Flow | undefined {
    return this.workspace.flows.find((f) => f.id === id)
  }

  private getNode(flow: Flow, id: string): FlowNode | undefined {
    return flow.nodes.find((n) => n.id === id)
  }

  private getEdgesFrom(flow: Flow, nodeId: string, handleId?: string): FlowEdge[] {
    return flow.edges.filter((e) => e.source === nodeId && (handleId ? e.sourceHandle === handleId : true))
  }

  private findNextNode(flow: Flow, currentNodeId: string, handleId?: string): FlowNode | undefined {
    const edges = this.getEdgesFrom(flow, currentNodeId, handleId)
    if (edges.length === 0) return undefined
    const edge = edges[0]
    return this.getNode(flow, edge.target)
  }

  private getContact(telegramId: number): ContactState {
    if (!this.contacts.has(telegramId)) {
      this.contacts.set(telegramId, {
        id: `contact-${telegramId}`,
        telegramId,
        firstName: '',
        tags: [],
        fields: {},
        currentFlowRunId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
    return this.contacts.get(telegramId)!
  }

  private updateContact(telegramId: number, updates: Partial<ContactState>) {
    const c = this.getContact(telegramId)
    Object.assign(c, updates, { updatedAt: Date.now() })
  }

  async handleEvent(event: {
    type: 'message' | 'callback' | 'new_chat'
    telegramId: number
    firstName?: string
    lastName?: string
    username?: string
    languageCode?: string
    isPremium?: boolean
    text?: string
    callbackData?: string
    audioFileId?: string
  }): Promise<void> {
    const contact = this.getContact(event.telegramId)
    if (event.firstName) contact.firstName = event.firstName
    if (event.lastName !== undefined) contact.lastName = event.lastName
    if (event.username !== undefined) contact.username = event.username
    if (event.languageCode !== undefined) contact.languageCode = event.languageCode
    if (event.isPremium !== undefined) contact.isPremium = event.isPremium
    contact.updatedAt = Date.now()

    // If contact has an active run waiting for input, resume it
    const existingRun = contact.currentFlowRunId ? this.runs.get(contact.currentFlowRunId) : undefined
    if (existingRun && existingRun.status === 'waiting_for_input') {
      if (event.text) {
        const node = this.getNodeFromRun(existingRun)
        if (node && node.data.inputSaveTo) {
          let value: unknown = event.text
          const inputType = node.data.inputType || 'text'
          if (inputType === 'number') value = parseFloat(event.text)
          if (inputType === 'date') value = event.text
          contact.fields[node.data.inputSaveTo] = value
        }
      }
      existingRun.status = 'running'
      existingRun.updatedAt = Date.now()
      await this.executeRun(existingRun)
      return
    }

    // Dispatch to matching triggers
    const matchingFlows = this.findMatchingTriggers(event)
    for (const flow of matchingFlows) {
      const triggerNode = flow.nodes.find((n) => n.data.type === 'trigger')
      if (!triggerNode) continue

      const run: FlowRun = {
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        contactId: contact.id,
        flowId: flow.id,
        currentNodeId: triggerNode.id,
        status: 'running',
        context: {
          event,
          firstName: contact.firstName,
          lastName: contact.lastName,
          username: contact.username,
          languageCode: contact.languageCode,
        },
        stepsExecuted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lockedUntil: null,
      }

      this.runs.set(run.id, run)
      contact.currentFlowRunId = run.id
      await this.executeRun(run)
    }
  }

  private findMatchingTriggers(event: { type: string; text?: string; callbackData?: string }): Flow[] {
    return this.workspace.flows.filter((flow) => {
      const triggerNode = flow.nodes.find((n) => n.data.type === 'trigger')
      if (!triggerNode) return false
      const data = triggerNode.data
      const method = data.triggerMethod || 'keyword'

      switch (method) {
        case 'keyword': {
          const keywords = data.triggerKeywords || []
          if (!event.text) return false
          return keywords.some((kw) => event.text!.toLowerCase().includes(kw.toLowerCase()))
        }
        case 'default_reply':
          return event.type === 'message' && !this.findOtherMatchingFlow(event, flow.id)
        case 'first_contact':
          return event.type === 'new_chat'
        case 'button_clicked':
          return event.callbackData === data.triggerButtonValue
        default:
          return false
      }
    })
  }

  private findOtherMatchingFlow(event: { text?: string }, excludeId: string): boolean {
    return this.workspace.flows.some((flow) => {
      if (flow.id === excludeId) return false
      const tn = flow.nodes.find((n) => n.data.type === 'trigger')
      if (!tn) return false
      const kw = tn.data.triggerKeywords || []
      return kw.some((k) => event.text?.toLowerCase().includes(k.toLowerCase()))
    })
  }

  private getNodeFromRun(run: FlowRun): FlowNode | undefined {
    const flow = this.getFlow(run.flowId)
    return flow ? this.getNode(flow, run.currentNodeId) : undefined
  }

  private async executeRun(run: FlowRun): Promise<void> {
    while (run.status === 'running') {
      if (run.stepsExecuted >= MAX_CONTINUOUS_STEPS) {
        run.status = 'paused'
        break
      }

      const node = this.getNodeFromRun(run)
      if (!node) {
        run.status = 'completed'
        break
      }

      run.stepsExecuted++
      run.updatedAt = Date.now()

      const flow = this.getFlow(run.flowId)
      if (!flow) {
        run.status = 'failed'
        break
      }

      const contact = this.contacts.get(parseInt(run.contactId.replace('contact-', '')))
      if (!contact) {
        run.status = 'failed'
        break
      }

      const stepType = node.data.type

      switch (stepType) {
        case 'trigger': {
          const next = this.findNextNode(flow, node.id, 'default')
          if (next) run.currentNodeId = next.id
          else run.status = 'completed'
          break
        }

        case 'send_message': {
          const messages = node.data.messages || []
          const delay = node.data.typingDelay || 0
          for (const msg of messages) {
            const rendered = this.renderMessage(msg, run.context)
            await this.sendFn(contact.telegramId, rendered)
            if (delay > 0) await this.sleep(delay)
          }
          const next = this.findNextNode(flow, node.id, 'default')
          if (next) run.currentNodeId = next.id
          else run.status = 'completed'
          break
        }

        case 'user_input': {
          const prompt = node.data.inputPrompt
          if (prompt) {
            const rendered = this.renderTemplate(prompt, run.context)
            await this.sendFn(contact.telegramId, rendered)
          }
          run.status = 'waiting_for_input'
          break
        }

        case 'condition': {
          const branches = node.data.conditionBranches || []
          let matchedBranchId: string | undefined
          for (const branch of branches) {
            if (this.evaluateBranch(branch, contact)) {
              matchedBranchId = branch.id
              break
            }
          }
          const edges = this.getEdgesFrom(flow, node.id)
          const nextEdge = matchedBranchId
            ? edges.find((e) => e.sourceHandle === matchedBranchId)
            : edges[0]
          if (nextEdge) run.currentNodeId = nextEdge.target
          else run.status = 'completed'
          break
        }

        case 'action': {
          const actions = node.data.actions || []
          for (const action of actions) {
            this.executeAction(action, contact)
          }
          const next = this.findNextNode(flow, node.id, 'default')
          if (next) run.currentNodeId = next.id
          else run.status = 'completed'
          break
        }

        case 'smart_delay': {
          const ms = this.resolveDelay(node.data)
          if (ms > 0) {
            run.status = 'waiting_until_time'
            run.lockedUntil = Date.now() + ms
            this.scheduleResume(run, ms)
          } else {
            const next = this.findNextNode(flow, node.id, 'default')
            if (next) run.currentNodeId = next.id
            else run.status = 'completed'
          }
          break
        }

        case 'randomizer': {
          const branches = node.data.randomizerBranches || []
          const mode = node.data.randomizerMode || 'even'
          let selectedBranchId: string | undefined
          if (branches.length > 0) {
            if (mode === 'even') {
              const idx = Math.floor(Math.random() * branches.length)
              selectedBranchId = branches[idx].id
            } else {
              const total = branches.reduce((s, b) => s + b.weight, 0)
              let r = Math.random() * total
              for (const b of branches) {
                r -= b.weight
                if (r <= 0) { selectedBranchId = b.id; break }
              }
              if (!selectedBranchId) selectedBranchId = branches[0].id
            }
          }
          const edges = this.getEdgesFrom(flow, node.id)
          const nextEdge = selectedBranchId
            ? edges.find((e) => e.sourceHandle === selectedBranchId)
            : edges[0]
          if (nextEdge) run.currentNodeId = nextEdge.target
          else run.status = 'completed'
          break
        }

        case 'http_request': {
          let result: string | null = null
          try {
            const method = node.data.httpMethod || 'GET'
            const url = this.renderTemplate(node.data.httpUrl || '', run.context)
            const headers: Record<string, string> = {}
            const hdrs = node.data.httpHeaders || []
            for (const h of hdrs) { if (h.key) headers[h.key] = h.value }
            const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json', ...headers },
              body: method !== 'GET' ? this.renderTemplate(node.data.httpBody || '', run.context) : undefined,
            })
            result = await res.text()
            if (node.data.httpSaveTo) {
              contact.fields[node.data.httpSaveTo] = result
            }
          } catch (e) {
            result = null
          }
          const next = this.findNextNode(flow, node.id, 'default')
          if (next) run.currentNodeId = next.id
          else run.status = 'completed'
          break
        }

        case 'start_flow': {
          const targetId = node.data.targetFlowId
          if (targetId) {
            const targetFlow = this.getFlow(targetId)
            if (targetFlow) {
              const newRun: FlowRun = {
                id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                contactId: run.contactId,
                flowId: targetId,
                currentNodeId: targetFlow.nodes.find((n) => n.data.type === 'trigger')?.id || targetFlow.nodes[0]?.id || '',
                status: 'running',
                context: run.context,
                stepsExecuted: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lockedUntil: null,
              }
              this.runs.set(newRun.id, newRun)
              contact.currentFlowRunId = newRun.id
              await this.executeRun(newRun)
              return
            }
          }
          const next = this.findNextNode(flow, node.id, 'default')
          if (next) run.currentNodeId = next.id
          else run.status = 'completed'
          break
        }

        case 'ai_response': {
          const provider = node.data.aiProvider || 'deepseek'
          const model = node.data.aiModel || 'deepseek-chat'
          const systemPrompt = node.data.aiSystemPrompt || 'Eres un asistente útil.'
          const temp = node.data.aiTemperature ?? 0.7
          const maxTokens = node.data.aiMaxTokens || 1000
          const contextMsgs = node.data.aiContextMessages || 5

          if (provider === 'deepseek' && this.config.deepseekApiKey) {
            try {
              const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
                { role: 'system', content: this.renderTemplate(systemPrompt, run.context) },
              ]
              const userMsg = (run.context?.event as Record<string, unknown>)?.text as string || ''
              messages.push({ role: 'user', content: userMsg })

              const reply = await deepseekChat(
                this.config.deepseekApiKey, model, messages, temp, maxTokens,
              )
              await this.sendFn(contact.telegramId, reply)
            } catch (e) {
              await this.sendFn(contact.telegramId, 'Lo siento, no pude procesar tu mensaje en este momento.')
            }
          }

          const next = this.findNextNode(flow, node.id, 'default')
          if (next) run.currentNodeId = next.id
          else run.status = 'completed'
          break
        }

        case 'comment': {
          const next = this.findNextNode(flow, node.id, 'default')
          if (next) run.currentNodeId = next.id
          else run.status = 'completed'
          break
        }

        default:
          run.status = 'completed'
          break
      }
    }
  }

  private evaluateBranch(branch: { rules: ConditionRule[]; logic: 'and' | 'or' }, contact: ContactState): boolean {
    if (!branch.rules || branch.rules.length === 0) return false
    const results = branch.rules.map((rule) => this.evaluateRule(rule, contact))
    return branch.logic === 'and' ? results.every(Boolean) : results.some(Boolean)
  }

  private evaluateRule(rule: ConditionRule, contact: ContactState): boolean {
    let leftValue: unknown
    switch (rule.field.source) {
      case 'tag':
        leftValue = contact.tags.includes(rule.field.name)
        break
      case 'custom_field':
        leftValue = contact.fields[rule.field.name]
        break
      case 'system':
        leftValue = (contact as unknown as Record<string, unknown>)[rule.field.name]
        break
      default:
        leftValue = null
    }

    const right = rule.value

    switch (rule.operator) {
      case 'equals': return String(leftValue) === right
      case 'not_equals': return String(leftValue) !== right
      case 'contains': return String(leftValue || '').toLowerCase().includes(right.toLowerCase())
      case 'not_contains': return !String(leftValue || '').toLowerCase().includes(right.toLowerCase())
      case 'greater_than': return parseFloat(String(leftValue)) > parseFloat(right)
      case 'less_than': return parseFloat(String(leftValue)) < parseFloat(right)
      case 'is_empty': return !leftValue || String(leftValue).trim() === ''
      case 'is_not_empty': return !!leftValue && String(leftValue).trim() !== ''
      case 'exists': return leftValue !== undefined && leftValue !== null
      case 'not_exists': return leftValue === undefined || leftValue === null
      case 'in_list': {
        const list = right.split(',').map((s) => s.trim())
        return list.includes(String(leftValue))
      }
      case 'not_in_list': {
        const list = right.split(',').map((s) => s.trim())
        return !list.includes(String(leftValue))
      }
      case 'starts_with': return String(leftValue || '').startsWith(right)
      case 'ends_with': return String(leftValue || '').endsWith(right)
      case 'date_before': return new Date(String(leftValue)) < new Date(right)
      case 'date_after': return new Date(String(leftValue)) > new Date(right)
      case 'date_between': {
        const [from, to] = right.split(',').map((s) => s.trim())
        const d = new Date(String(leftValue))
        return d >= new Date(from) && d <= new Date(to)
      }
      default: return false
    }
  }

  private executeAction(action: { type: string; params: Record<string, string> }, contact: ContactState) {
    switch (action.type) {
      case 'set_custom_field':
        contact.fields[action.params.name] = action.params.value
        break
      case 'clear_custom_field':
        delete contact.fields[action.params.name]
        break
      case 'add_tag':
        if (!contact.tags.includes(action.params.name)) contact.tags.push(action.params.name)
        break
      case 'remove_tag':
        contact.tags = contact.tags.filter((t) => t !== action.params.name)
        break
      case 'mark_conversation_open':
        contact.fields['_conversation_status'] = 'open'
        break
      case 'mark_conversation_closed':
        contact.fields['_conversation_status'] = 'closed'
        break
    }
  }

  private renderMessage(msg: MessageContent, context: Record<string, unknown>): MessageContent | string {
    if (msg.type === 'text') {
      return this.renderTemplate(msg.text, context)
    }
    return msg
  }

  private renderTemplate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(context[key] ?? '')
    })
  }

  private resolveDelay(data: StepData): number {
    if (data.delayValue && data.delayUnit) {
      const mult = data.delayUnit === 'minutes' ? 60000 : data.delayUnit === 'hours' ? 3600000 : 86400000
      return data.delayValue * mult
    }
    return 0
  }

  scheduleResume(run: FlowRun, ms: number) {
    const task: ScheduledTask = {
      runId: run.id,
      resumeAt: Date.now() + ms,
    }
    this.scheduler.push(task)
    setTimeout(() => this.resumeRun(run.id), ms)
  }

  private async resumeRun(runId: string) {
    const run = this.runs.get(runId)
    if (!run) return
    if (run.status !== 'waiting_until_time') return

    const flow = this.getFlow(run.flowId)
    if (!flow) return

    const node = this.getNode(flow, run.currentNodeId)
    if (!node) return

    const next = this.findNextNode(flow, node.id, 'default')
    if (next) run.currentNodeId = next.id
    else run.status = 'completed'

    run.status = 'running'
    run.lockedUntil = null
    await this.executeRun(run)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  getContactState(telegramId: number): ContactState | undefined {
    return this.contacts.get(telegramId)
  }

  getRunState(runId: string): FlowRun | undefined {
    return this.runs.get(runId)
  }

  getAllRuns(): FlowRun[] {
    return Array.from(this.runs.values())
  }
}

interface ScheduledTask {
  runId: string
  resumeAt: number
}
