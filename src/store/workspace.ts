import { create } from 'zustand'
import type { Workspace, Flow, FlowNode, BotConfig, CustomField, Tag, StepType } from '@/types'
import { v4 as uuid } from 'uuid'
import { STEP_LABELS } from '@/lib/step-definitions'

const WORKSPACE_KEY = 'chatflow-workspace'

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return createDefaultWorkspace()
}

function createDefaultWorkspace(): Workspace {
  return {
    id: uuid(),
    name: 'Mi Bot',
    botConfig: {
      telegramToken: '',
      deepseekApiKey: '',
      groqApiKey: '',
    },
    flows: [
      {
        id: uuid(),
        name: 'Flow Principal',
        nodes: [],
        edges: [],
        triggers: ['default_reply'],
        keywords: [],
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    customFields: [],
    tags: [],
    published: false,
    publishedAt: null,
  }
}

interface WorkspaceState {
  workspace: Workspace
  activeFlowId: string
  selectedNodeId: string | null

  setBotConfig: (config: Partial<BotConfig>) => void
  addCustomField: (field: Omit<CustomField, 'id'>) => void
  removeCustomField: (id: string) => void
  addTag: (tag: Omit<Tag, 'id'>) => void
  removeTag: (id: string) => void

  activeFlow: () => Flow
  addFlow: (name: string) => string
  removeFlow: (id: string) => void
  setActiveFlow: (id: string) => void
  renameFlow: (id: string, name: string) => void

  addNode: (type: StepType, label: string, position: { x: number; y: number }) => string
  updateNode: (id: string, data: Partial<FlowNode['data']>) => void
  removeNode: (id: string) => void
  moveNode: (id: string, position: { x: number; y: number }) => void

  addEdge: (source: string, target: string, sourceHandle?: string, label?: string) => void
  removeEdge: (id: string) => void

  setSelectedNode: (id: string | null) => void

  save: () => void
  load: () => void
  exportWorkspace: () => string
  importWorkspace: (json: string) => void

  publish: () => void
}

export const useStore = create<WorkspaceState>((set, get) => ({
  workspace: loadWorkspace(),
  activeFlowId: loadWorkspace().flows[0]?.id ?? '',
  selectedNodeId: null,

  setBotConfig: (config) => {
    set((s) => ({
      workspace: { ...s.workspace, botConfig: { ...s.workspace.botConfig, ...config } },
    }))
    get().save()
  },

  addCustomField: (field) => {
    const f: CustomField = { ...field, id: uuid() }
    set((s) => ({ workspace: { ...s.workspace, customFields: [...s.workspace.customFields, f] } }))
    get().save()
  },

  removeCustomField: (id) => {
    set((s) => ({ workspace: { ...s.workspace, customFields: s.workspace.customFields.filter((f) => f.id !== id) } }))
    get().save()
  },

  addTag: (tag) => {
    const t: Tag = { ...tag, id: uuid() }
    set((s) => ({ workspace: { ...s.workspace, tags: [...s.workspace.tags, t] } }))
    get().save()
  },

  removeTag: (id) => {
    set((s) => ({ workspace: { ...s.workspace, tags: s.workspace.tags.filter((t) => t.id !== id) } }))
    get().save()
  },

  activeFlow: () => {
    const { workspace, activeFlowId } = get()
    return workspace.flows.find((f) => f.id === activeFlowId) ?? workspace.flows[0]
  },

  addFlow: (name) => {
    const id = uuid()
    const flow: Flow = { id, name, nodes: [], edges: [], triggers: [], keywords: [], isDefault: false, createdAt: Date.now(), updatedAt: Date.now() }
    set((s) => ({ workspace: { ...s.workspace, flows: [...s.workspace.flows, flow] }, activeFlowId: id }))
    get().save()
    return id
  },

  removeFlow: (id) => {
    set((s) => {
      const flows = s.workspace.flows.filter((f) => f.id !== id)
      return { workspace: { ...s.workspace, flows }, activeFlowId: flows[0]?.id ?? '', selectedNodeId: null }
    })
    get().save()
  },

  setActiveFlow: (id) => set({ activeFlowId: id, selectedNodeId: null }),

  renameFlow: (id, name) => {
    set((s) => ({ workspace: { ...s.workspace, flows: s.workspace.flows.map((f) => f.id === id ? { ...f, name, updatedAt: Date.now() } : f) } }))
    get().save()
  },

  addNode: (stepType, _label, position) => {
    const id = uuid()
    const flow = get().activeFlow()
    const label = _label || (STEP_LABELS as Record<string, string>)[stepType] || stepType
    const newNode: FlowNode = {
      id, type: 'step', position,
      data: { type: stepType, stepType, label, messages: stepType === 'send_message' ? [{ type: 'text', text: '' }] : undefined },
    }
    set((s) => ({
      workspace: { ...s.workspace, flows: s.workspace.flows.map((f) => f.id === flow.id ? { ...f, nodes: [...f.nodes, newNode], updatedAt: Date.now() } : f) },
      selectedNodeId: id,
    }))
    get().save()
    return id
  },

  updateNode: (id, data) => {
    set((s) => ({
      workspace: { ...s.workspace, flows: s.workspace.flows.map((f) => ({ ...f, nodes: f.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n), updatedAt: Date.now() })) },
    }))
    get().save()
  },

  removeNode: (id) => {
    set((s) => ({
      workspace: { ...s.workspace, flows: s.workspace.flows.map((f) => ({ ...f, nodes: f.nodes.filter((n) => n.id !== id), edges: f.edges.filter((e) => e.source !== id && e.target !== id), updatedAt: Date.now() })) },
      selectedNodeId: null,
    }))
    get().save()
  },

  moveNode: (id, position) => {
    set((s) => ({ workspace: { ...s.workspace, flows: s.workspace.flows.map((f) => ({ ...f, nodes: f.nodes.map((n) => n.id === id ? { ...n, position } : n) })) } }))
    get().save()
  },

  addEdge: (source, target, sourceHandle, label) => {
    const flow = get().activeFlow()
    const exists = flow.edges.some((e) => e.source === source && e.target === target && e.sourceHandle === (sourceHandle ?? 'default'))
    if (exists) return
    const edge = { id: uuid(), source, target, sourceHandle: sourceHandle ?? 'default', label }
    set((s) => ({ workspace: { ...s.workspace, flows: s.workspace.flows.map((f) => f.id === flow.id ? { ...f, edges: [...f.edges, edge], updatedAt: Date.now() } : f) } }))
    get().save()
  },

  removeEdge: (id) => {
    set((s) => ({ workspace: { ...s.workspace, flows: s.workspace.flows.map((f) => ({ ...f, edges: f.edges.filter((e) => e.id !== id), updatedAt: Date.now() })) } }))
    get().save()
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  save: () => {
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(get().workspace)) } catch { /* */ }
  },

  load: () => {
    const w = loadWorkspace()
    set({ workspace: w, activeFlowId: w.flows[0]?.id ?? '', selectedNodeId: null })
  },

  exportWorkspace: () => JSON.stringify(get().workspace, null, 2),

  importWorkspace: (json) => {
    try {
      const w: Workspace = JSON.parse(json)
      set({ workspace: w, activeFlowId: w.flows[0]?.id ?? '', selectedNodeId: null })
      get().save()
    } catch { /* */ }
  },

  publish: () => {
    set((s) => ({ workspace: { ...s.workspace, published: true, publishedAt: Date.now() } }))
    get().save()
  },
}))
