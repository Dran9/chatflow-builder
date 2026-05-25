import { useStore } from '@/store/workspace'
import { STEP_LABELS, STEP_COLORS } from '@/lib/step-definitions'
import { X, Trash2, MessageCircle } from 'lucide-react'
import type { StepData, MessageContent, ConditionBranch, ActionItem } from '@/types'
import { useState } from 'react'

export default function PropertyPanel({ onClose }: { onClose: () => void }) {
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const activeFlow = useStore((s) => s.activeFlow())
  const updateNode = useStore((s) => s.updateNode)
  const removeNode = useStore((s) => s.removeNode)
  const setSelectedNode = useStore((s) => s.setSelectedNode)

  const node = activeFlow.nodes.find((n) => n.id === selectedNodeId)

  if (!node) {
    return (
      <aside className="w-56 h-full flex flex-col bg-[var(--flow-surface)] border-l border-[var(--flow-border)] shrink-0">
        <div className="flex items-center justify-between p-2 border-b border-[var(--flow-border)]">
          <h3 className="text-[9px] font-semibold uppercase tracking-wider text-[var(--flow-text-muted)]">
            Propiedades
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--flow-surface2)] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)]">
            <X size={12} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <MessageCircle size={20} className="mx-auto mb-2 text-[var(--flow-text-muted)]" />
            <p className="text-[10px] text-[var(--flow-text-muted)]">
              Selecciona un nodo en el canvas
            </p>
          </div>
        </div>
      </aside>
    )
  }

  const data = node.data as StepData
  const color = (STEP_COLORS as Record<string, string>)[data.type] || '#6b7280'

  return (
    <aside className="w-56 h-full flex flex-col bg-[var(--flow-surface)] border-l border-[var(--flow-border)] shrink-0">
      <div className="flex items-center justify-between p-2 border-b border-[var(--flow-border)]">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-4 h-4 rounded shrink-0" style={{ background: `${color}22` }}>
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-sm" style={{ background: color }} />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="text-[11px] font-medium text-[var(--flow-text)] truncate">
              {(STEP_LABELS as Record<string, string>)[data.type]}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { removeNode(node.id); setSelectedNode(null) }}
            className="p-1 rounded hover:bg-red-500/10 text-[var(--flow-text-muted)] hover:text-red-400"
            title="Eliminar"
          >
            <Trash2 size={11} />
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--flow-surface2)] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)]">
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-3">
        <PropertyLabel data={data} onChange={(partial) => updateNode(node.id, partial)} />
        <PropertyContent data={data} onChange={(partial) => updateNode(node.id, partial)} />
      </div>
    </aside>
  )
}

function PropertyLabel({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[8px] font-semibold uppercase tracking-wider text-[var(--flow-text-muted)]">
        Etiqueta
      </label>
      <input
        value={data.label || ''}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Nombre"
        className="w-full px-2 py-1 text-[10px] rounded bg-[var(--flow-surface2)] border border-[var(--flow-border)]
                   text-[var(--flow-text)] placeholder:text-[var(--flow-text-muted)] focus:outline-none focus:border-purple-500/50"
      />
    </div>
  )
}

function PropertyContent({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  switch (data.type) {
    case 'send_message': return <SendMessageProps data={data} onChange={onChange} />
    case 'user_input': return <UserInputProps data={data} onChange={onChange} />
    case 'condition': return <ConditionProps data={data} onChange={onChange} />
    case 'action': return <ActionProps data={data} onChange={onChange} />
    case 'smart_delay': return <SmartDelayProps data={data} onChange={onChange} />
    case 'randomizer': return <RandomizerProps data={data} onChange={onChange} />
    case 'http_request': return <HttpRequestProps data={data} onChange={onChange} />
    case 'start_flow': return <StartFlowProps data={data} onChange={onChange} />
    case 'ai_response': return <AIResponseProps data={data} onChange={onChange} />
    case 'trigger': return <TriggerProps data={data} onChange={onChange} />
    case 'comment': return <CommentProps data={data} onChange={onChange} />
    default: return null
  }
}

const inputClass = "w-full px-2 py-1 text-[10px] rounded bg-[var(--flow-surface2)] border border-[var(--flow-border)] text-[var(--flow-text)] placeholder:text-[var(--flow-text-muted)] focus:outline-none focus:border-purple-500/50"
const labelClass = "text-[8px] font-semibold uppercase tracking-wider text-[var(--flow-text-muted)]"
const btnClass = "px-1.5 py-0.5 text-[9px] rounded border border-[var(--flow-border)] text-[var(--flow-text-muted)] hover:border-purple-500/30 hover:text-purple-300 transition-colors"
const addBtnClass = "w-full px-1.5 py-1 text-[9px] rounded border border-dashed border-[var(--flow-border)] text-[var(--flow-text-muted)] hover:border-purple-500/30 hover:text-purple-300 transition-colors"

function SendMessageProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const messages = data.messages || []
  const addMessage = (type: MessageContent['type']) => {
    const newMsg: MessageContent = type === 'text' ? { type: 'text', text: '' }
      : type === 'image' ? { type: 'image', url: '', caption: '' }
      : { type: 'text', text: '' }
    onChange({ messages: [...messages, newMsg] })
  }
  const updateMessage = (idx: number, msg: Partial<MessageContent>) => {
    const updated = [...messages]
    updated[idx] = { ...updated[idx], ...msg } as MessageContent
    onChange({ messages: updated })
  }
  const removeMessage = (idx: number) => onChange({ messages: messages.filter((_, i) => i !== idx) })

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Mensajes</label>
        {messages.map((msg, idx) => (
          <div key={idx} className="relative group">
            <textarea
              value={msg.type === 'text' ? msg.text : msg.type === 'image' ? msg.url : ''}
              onChange={(e) => msg.type === 'text' ? updateMessage(idx, { text: e.target.value }) : updateMessage(idx, { url: e.target.value })}
              placeholder="Mensaje..."
              rows={2}
              className={`${inputClass} resize-none`}
            />
            <button onClick={() => removeMessage(idx)}
              className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100">
              <X size={8} />
            </button>
          </div>
        ))}
        <div className="flex gap-1 flex-wrap">
          {(['text', 'image', 'video', 'audio', 'file'] as const).map((t) => (
            <button key={t} onClick={() => addMessage(t)} className={btnClass}>+ {t}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Delay escritura (ms)</label>
        <input type="number" value={data.typingDelay || 0}
          onChange={(e) => onChange({ typingDelay: parseInt(e.target.value) || 0 })} className={inputClass} />
      </div>
    </div>
  )
}

function UserInputProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const inputTypes = [
    { value: 'text', label: 'Texto' }, { value: 'number', label: 'Número' },
    { value: 'email', label: 'Email' }, { value: 'phone', label: 'Teléfono' },
    { value: 'date', label: 'Fecha' }, { value: 'image', label: 'Imagen' },
    { value: 'file', label: 'Archivo' }, { value: 'location', label: 'Ubicación' },
    { value: 'voice', label: 'Voz' },
  ]

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Tipo</label>
        <select value={data.inputType || 'text'} onChange={(e) => onChange({ inputType: e.target.value as any })} className={inputClass}>
          {inputTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Pregunta</label>
        <textarea value={data.inputPrompt || ''} onChange={(e) => onChange({ inputPrompt: e.target.value })}
          placeholder="¿Cuál es tu nombre?" rows={2} className={`${inputClass} resize-none`} />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Guardar en campo</label>
        <input value={data.inputSaveTo || ''} onChange={(e) => onChange({ inputSaveTo: e.target.value })}
          placeholder="nombre, email..." className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Mensaje error</label>
        <input value={data.inputErrorMessage || ''} onChange={(e) => onChange({ inputErrorMessage: e.target.value })}
          placeholder="Respuesta inválida" className={inputClass} />
      </div>
    </div>
  )
}

function ConditionProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const branches = data.conditionBranches || []
  const addBranch = () => {
    const b: ConditionBranch = {
      id: `b-${Date.now()}`, label: `Rama ${branches.length + 1}`,
      rules: [{ id: `r-${Date.now()}`, field: { source: 'tag', name: '' }, operator: 'equals', value: '' }], logic: 'and',
    }
    onChange({ conditionBranches: [...branches, b] })
  }
  const updateBranch = (idx: number, b: Partial<ConditionBranch>) => {
    const u = [...branches]; u[idx] = { ...u[idx], ...b }; onChange({ conditionBranches: u })
  }
  const removeBranch = (idx: number) => onChange({ conditionBranches: branches.filter((_, i) => i !== idx) })

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Ramas</label>
        {branches.map((b, idx) => (
          <div key={b.id} className="p-1.5 rounded bg-[var(--flow-surface2)] border border-[var(--flow-border)] space-y-1">
            <div className="flex items-center justify-between">
              <input value={b.label} onChange={(e) => updateBranch(idx, { label: e.target.value })}
                className="flex-1 px-1.5 py-0.5 text-[10px] rounded bg-[var(--flow-surface)] border border-[var(--flow-border)] text-[var(--flow-text)]"
                placeholder="Nombre rama" />
              <button onClick={() => removeBranch(idx)} className="p-0.5 text-[var(--flow-text-muted)] hover:text-red-400"><X size={10} /></button>
            </div>
          </div>
        ))}
        <button onClick={addBranch} className={addBtnClass}>+ Agregar rama</button>
      </div>
    </div>
  )
}

function ActionProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const actions = data.actions || []
  const actionTypes = [
    { value: 'set_custom_field', label: 'Set Campo' }, { value: 'clear_custom_field', label: 'Limpiar Campo' },
    { value: 'add_tag', label: 'Agregar Tag' }, { value: 'remove_tag', label: 'Quitar Tag' },
    { value: 'notify_admin', label: 'Notificar Admin' }, { value: 'mark_conversation_open', label: 'Abrir Chat' },
    { value: 'mark_conversation_closed', label: 'Cerrar Chat' },
  ]
  const addAction = () => onChange({ actions: [...actions, { id: `a-${Date.now()}`, type: 'add_tag', params: {} }] })
  const updateAction = (idx: number, a: Partial<ActionItem>) => { const u = [...actions]; u[idx] = { ...u[idx], ...a }; onChange({ actions: u }) }
  const removeAction = (idx: number) => onChange({ actions: actions.filter((_, i) => i !== idx) })

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Acciones</label>
        {actions.map((a, idx) => (
          <div key={a.id} className="p-1.5 rounded bg-[var(--flow-surface2)] border border-[var(--flow-border)] space-y-1">
            <div className="flex items-center justify-between">
              <select value={a.type} onChange={(e) => updateAction(idx, { type: e.target.value as any })}
                className="flex-1 px-1.5 py-0.5 text-[10px] rounded bg-[var(--flow-surface)] border border-[var(--flow-border)] text-[var(--flow-text)]">
                {actionTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button onClick={() => removeAction(idx)} className="p-0.5 text-[var(--flow-text-muted)] hover:text-red-400"><X size={10} /></button>
            </div>
            <div className="flex gap-1">
              <input value={a.params.name || ''} onChange={(e) => updateAction(idx, { params: { ...a.params, name: e.target.value } })}
                placeholder="Nombre" className={`flex-1 ${inputClass}`} />
              <input value={a.params.value || ''} onChange={(e) => updateAction(idx, { params: { ...a.params, value: e.target.value } })}
                placeholder="Valor" className={`flex-1 ${inputClass}`} />
            </div>
          </div>
        ))}
        <button onClick={addAction} className={addBtnClass}>+ Agregar acción</button>
      </div>
    </div>
  )
}

function SmartDelayProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Duración</label>
        <div className="flex gap-1.5">
          <input type="number" value={data.delayValue || 0}
            onChange={(e) => onChange({ delayValue: parseInt(e.target.value) || 0 })} className={`flex-1 ${inputClass}`} />
          <select value={data.delayUnit || 'minutes'} onChange={(e) => onChange({ delayUnit: e.target.value as any })} className={inputClass}>
            <option value="minutes">Min</option>
            <option value="hours">Hrs</option>
            <option value="days">Días</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function RandomizerProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const branches = data.randomizerBranches || []
  const mode = data.randomizerMode || 'even'
  const addBranch = () => onChange({ randomizerBranches: [...branches, { id: `rb-${Date.now()}`, label: `R ${branches.length + 1}`, weight: 1 }] })
  const updateBranch = (idx: number, b: Partial<(typeof branches)[0]>) => { const u = [...branches]; u[idx] = { ...u[idx], ...b }; onChange({ randomizerBranches: u }) }
  const removeBranch = (idx: number) => onChange({ randomizerBranches: branches.filter((_, i) => i !== idx) })

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Modo</label>
        <select value={mode} onChange={(e) => onChange({ randomizerMode: e.target.value as any })} className={inputClass}>
          <option value="even">Equitativo</option>
          <option value="weighted">Por peso</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Ramas</label>
        {branches.map((b, idx) => (
          <div key={b.id} className="flex items-center gap-1">
            <input value={b.label} onChange={(e) => updateBranch(idx, { label: e.target.value })} className={`flex-1 ${inputClass}`} placeholder="Rama" />
            {mode === 'weighted' && (
              <input type="number" value={b.weight} onChange={(e) => updateBranch(idx, { weight: parseInt(e.target.value) || 1 })}
                className={`w-10 ${inputClass}`} placeholder="Peso" />
            )}
            <button onClick={() => removeBranch(idx)} className="p-0.5 text-[var(--flow-text-muted)] hover:text-red-400"><X size={10} /></button>
          </div>
        ))}
        <button onClick={addBranch} className={addBtnClass}>+ Agregar rama</button>
      </div>
    </div>
  )
}

function HttpRequestProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const headers = data.httpHeaders || []
  const addHeader = () => onChange({ httpHeaders: [...headers, { key: '', value: '' }] })
  const updateHeader = (idx: number, h: Partial<(typeof headers)[0]>) => { const u = [...headers]; u[idx] = { ...u[idx], ...h }; onChange({ httpHeaders: u }) }
  const removeHeader = (idx: number) => onChange({ httpHeaders: headers.filter((_, i) => i !== idx) })

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Método</label>
        <select value={data.httpMethod || 'GET'} onChange={(e) => onChange({ httpMethod: e.target.value as any })} className={inputClass}>
          <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option><option value="DELETE">DELETE</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>URL</label>
        <input value={data.httpUrl || ''} onChange={(e) => onChange({ httpUrl: e.target.value })}
          placeholder="https://..." className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Headers</label>
        {headers.map((h, idx) => (
          <div key={idx} className="flex gap-1">
            <input value={h.key} onChange={(e) => updateHeader(idx, { key: e.target.value })} placeholder="Key" className={`flex-1 ${inputClass}`} />
            <input value={h.value} onChange={(e) => updateHeader(idx, { value: e.target.value })} placeholder="Val" className={`flex-1 ${inputClass}`} />
            <button onClick={() => removeHeader(idx)} className="p-0.5 text-[var(--flow-text-muted)] hover:text-red-400"><X size={10} /></button>
          </div>
        ))}
        <button onClick={addHeader} className={addBtnClass}>+ Header</button>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Body (JSON)</label>
        <textarea value={data.httpBody || ''} onChange={(e) => onChange({ httpBody: e.target.value })}
          placeholder='{"key":"value"}' rows={3} className={`${inputClass} font-mono resize-none`} />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Guardar en campo</label>
        <input value={data.httpSaveTo || ''} onChange={(e) => onChange({ httpSaveTo: e.target.value })}
          placeholder="api_response" className={inputClass} />
      </div>
    </div>
  )
}

function StartFlowProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const flows = useStore((s) => s.workspace.flows)
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Flow destino</label>
        <select value={data.targetFlowId || ''} onChange={(e) => onChange({ targetFlowId: e.target.value })} className={inputClass}>
          <option value="">Seleccionar...</option>
          {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
    </div>
  )
}

function AIResponseProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Modelo</label>
        <input value={data.aiModel || 'deepseek-chat'} onChange={(e) => onChange({ aiModel: e.target.value })}
          placeholder="deepseek-chat" className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>System Prompt</label>
        <textarea value={data.aiSystemPrompt || ''} onChange={(e) => onChange({ aiSystemPrompt: e.target.value })}
          placeholder="Eres un asistente..." rows={3} className={`${inputClass} resize-none`} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-1">
          <label className={labelClass}>Temp</label>
          <input type="number" step="0.1" min="0" max="2" value={data.aiTemperature ?? 0.7}
            onChange={(e) => onChange({ aiTemperature: parseFloat(e.target.value) || 0.7 })} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Max Tokens</label>
          <input type="number" value={data.aiMaxTokens || 1000}
            onChange={(e) => onChange({ aiMaxTokens: parseInt(e.target.value) || 1000 })} className={inputClass} />
        </div>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Msjs contexto</label>
        <input type="number" value={data.aiContextMessages || 5}
          onChange={(e) => onChange({ aiContextMessages: parseInt(e.target.value) || 5 })} className={inputClass} />
      </div>
    </div>
  )
}

function TriggerProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  const [kwInput, setKwInput] = useState('')
  const keywords = data.triggerKeywords || []
  const addKw = () => { if (kwInput.trim()) { onChange({ triggerKeywords: [...keywords, kwInput.trim()] }); setKwInput('') } }
  const removeKw = (idx: number) => onChange({ triggerKeywords: keywords.filter((_, i) => i !== idx) })

  const triggers = [
    { value: 'keyword', label: 'Palabra clave' },
    { value: 'default_reply', label: 'Default Reply' },
    { value: 'first_contact', label: 'Primer contacto' },
    { value: 'button_clicked', label: 'Botón presionado' },
    { value: 'tag_applied', label: 'Tag aplicado' },
    { value: 'tag_removed', label: 'Tag removido' },
    { value: 'field_changed', label: 'Campo cambiado' },
    { value: 'scheduled', label: 'Programado' },
    { value: 'api_start', label: 'API Start' },
  ]

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Activación</label>
        <select value={data.triggerMethod || 'keyword'} onChange={(e) => onChange({ triggerMethod: e.target.value as any })} className={inputClass}>
          {triggers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {data.triggerMethod === 'keyword' && (
        <div className="space-y-1">
          <label className={labelClass}>Palabras clave</label>
          <div className="flex gap-1">
            <input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addKw() }}
              placeholder="Escribe y Enter" className={`flex-1 ${inputClass}`} />
            <button onClick={addKw} className="px-2 py-1 text-[10px] rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">+</button>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {keywords.map((kw, idx) => (
              <span key={idx} className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                {kw}
                <button onClick={() => removeKw(idx)} className="hover:text-purple-100"><X size={8} /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.triggerMethod === 'button_clicked' && (
        <div className="space-y-1">
          <label className={labelClass}>Valor del botón</label>
          <input value={data.triggerButtonValue || ''} onChange={(e) => onChange({ triggerButtonValue: e.target.value })}
            placeholder="callback_value" className={inputClass} />
        </div>
      )}

      {(data.triggerMethod === 'tag_applied' || data.triggerMethod === 'tag_removed') && (
        <div className="space-y-1">
          <label className={labelClass}>Nombre del tag</label>
          <input value={data.triggerTagName || ''} onChange={(e) => onChange({ triggerTagName: e.target.value })}
            placeholder="tag_name" className={inputClass} />
        </div>
      )}

      {data.triggerMethod === 'field_changed' && (
        <div className="space-y-1">
          <label className={labelClass}>Nombre del campo</label>
          <input value={data.triggerFieldName || ''} onChange={(e) => onChange({ triggerFieldName: e.target.value })}
            placeholder="field_name" className={inputClass} />
        </div>
      )}
    </div>
  )
}

function CommentProps({ data, onChange }: { data: StepData; onChange: (d: Partial<StepData>) => void }) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Texto</label>
        <textarea value={data.commentText || ''} onChange={(e) => onChange({ commentText: e.target.value })}
          placeholder="Notas..." rows={3} className={`${inputClass} resize-none`} />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Color</label>
        <div className="flex gap-1">
          {['#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map((c) => (
            <button key={c} onClick={() => onChange({ commentColor: c })}
              className="w-5 h-5 rounded border-2 transition-all"
              style={{ background: c, borderColor: data.commentColor === c ? '#fff' : 'transparent',
                boxShadow: data.commentColor === c ? `0 0 6px ${c}66` : 'none' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
