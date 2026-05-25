import type { StepType } from '@/types'
import { STEP_LABELS, STEP_COLORS, STEP_DESCRIPTIONS } from '@/lib/step-definitions'
import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle, HelpCircle, GitBranch, Zap, Clock, Shuffle,
  MessageSquare, Globe, ArrowRight, Sparkles, StickyNote, Plus, X, Settings,
} from 'lucide-react'
import { useStore } from '@/store/workspace'
import { useState } from 'react'

const ICONS: Record<string, LucideIcon> = {
  trigger: StickyNote,
  send_message: MessageCircle,
  user_input: HelpCircle,
  condition: GitBranch,
  action: Zap,
  smart_delay: Clock,
  randomizer: Shuffle,
  comment: MessageSquare,
  http_request: Globe,
  start_flow: ArrowRight,
  ai_response: Sparkles,
}

const STEP_ORDER: StepType[] = [
  'trigger', 'send_message', 'user_input', 'condition', 'action',
  'smart_delay', 'randomizer', 'http_request', 'start_flow', 'ai_response', 'comment',
]

function DraggableStep({ type }: { type: StepType }) {
  const Icon = ICONS[type] || MessageCircle
  const color = STEP_COLORS[type]

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/stepType', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-2 py-2 rounded-md cursor-grab active:cursor-grabbing
                 transition-all duration-150 hover:brightness-125 group"
      style={{ background: `${color}10`, border: `1px solid ${color}20` }}
      title={STEP_DESCRIPTIONS[type]}
    >
      <div
        className="flex items-center justify-center w-5 h-5 rounded-md shrink-0 transition-transform group-hover:scale-110"
        style={{ background: `${color}22` }}
      >
        <Icon size={10} color={color} />
      </div>
      <span className="text-[10px] font-medium text-[var(--flow-text)] truncate">
        {STEP_LABELS[type]}
      </span>
    </div>
  )
}

export default function Sidebar() {
  const flows = useStore((s) => s.workspace.flows)
  const activeFlowId = useStore((s) => s.activeFlowId)
  const setActiveFlow = useStore((s) => s.setActiveFlow)
  const addFlow = useStore((s) => s.addFlow)
  const removeFlow = useStore((s) => s.removeFlow)
  const renameFlow = useStore((s) => s.renameFlow)
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showNewFlow, setShowNewFlow] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')

  return (
    <aside className="w-52 h-full flex flex-col bg-[var(--flow-surface)] border-r border-[var(--flow-border)] shrink-0">
      <div className="p-2 border-b border-[var(--flow-border)]">
        <h2 className="text-[9px] font-semibold uppercase tracking-wider text-[var(--flow-text-muted)] mb-1.5">
          Flows
        </h2>

        <div className="space-y-0.5 max-h-28 overflow-y-auto scrollbar-thin">
          {flows.map((flow) => (
            <div key={flow.id} className="relative group/flow">
              {editingFlowId === flow.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => {
                    if (editName.trim()) renameFlow(flow.id, editName.trim())
                    setEditingFlowId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { if (editName.trim()) renameFlow(flow.id, editName.trim()); setEditingFlowId(null) }
                    if (e.key === 'Escape') setEditingFlowId(null)
                  }}
                  className="w-full px-1.5 py-1 text-[10px] rounded-md bg-[var(--flow-surface2)] border border-[var(--flow-border)]
                             text-[var(--flow-text)] focus:outline-none focus:border-purple-500/50"
                />
              ) : (
                <button
                  onClick={() => setActiveFlow(flow.id)}
                  onDoubleClick={() => { setEditingFlowId(flow.id); setEditName(flow.name) }}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors ${
                    flow.id === activeFlowId
                      ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                      : 'text-[var(--flow-text-muted)] hover:bg-[var(--flow-surface2)] hover:text-[var(--flow-text)]'
                  }`}
                >
                  <span className="truncate">{flow.name}</span>
                  {flow.isDefault && (
                    <span className="text-[8px] px-1 py-0 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Default</span>
                  )}
                </button>
              )}

              {!flow.isDefault && (
                <button
                  onClick={() => removeFlow(flow.id)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover/flow:opacity-100
                             text-[var(--flow-text-muted)] hover:text-red-400 transition-all"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>

        {showNewFlow ? (
          <div className="mt-1.5 flex gap-1">
            <input
              autoFocus
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="Nombre"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFlowName.trim()) { addFlow(newFlowName.trim()); setNewFlowName(''); setShowNewFlow(false) }
                if (e.key === 'Escape') { setShowNewFlow(false); setNewFlowName('') }
              }}
              className="flex-1 px-1.5 py-1 text-[10px] rounded bg-[var(--flow-surface2)] border border-[var(--flow-border)]
                         text-[var(--flow-text)] focus:outline-none focus:border-purple-500/50"
            />
            <button
              onClick={() => { if (newFlowName.trim()) { addFlow(newFlowName.trim()); setNewFlowName(''); setShowNewFlow(false) } }}
              className="px-1.5 py-1 text-[10px] rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
            >
              <Plus size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewFlow(true)}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[9px]
                       text-[var(--flow-text-muted)] hover:bg-[var(--flow-surface2)] hover:text-[var(--flow-text)]
                       border border-dashed border-[var(--flow-border)] transition-colors"
          >
            <Plus size={10} /> Nuevo
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        <h2 className="text-[9px] font-semibold uppercase tracking-wider text-[var(--flow-text-muted)] mb-1.5">
          Steps
        </h2>
        <div className="space-y-1">
          {STEP_ORDER.map((type) => (
            <DraggableStep key={type} type={type} />
          ))}
        </div>
      </div>

      <div className="p-2 border-t border-[var(--flow-border)]">
        <button
          onClick={() => useStore.getState().setActiveFlow('__settings__')}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] text-[var(--flow-text-muted)]
                     hover:bg-[var(--flow-surface2)] hover:text-[var(--flow-text)] transition-colors"
        >
          <Settings size={11} /> Configuración
        </button>
      </div>
    </aside>
  )
}
