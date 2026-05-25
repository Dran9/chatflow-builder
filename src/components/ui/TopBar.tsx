import { useStore } from '@/store/workspace'
import { PanelLeft, Download, Upload, Play, Save, Settings, CheckCircle, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'

export default function TopBar({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const workspace = useStore((s) => s.workspace)
  const exportWorkspace = useStore((s) => s.exportWorkspace)
  const importWorkspace = useStore((s) => s.importWorkspace)
  const publish = useStore((s) => s.publish)
  const save = useStore((s) => s.save)
  const [showSettings, setShowSettings] = useState(false)
  const [publishStatus, setPublishStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [publishError, setPublishError] = useState('')
  const [publishResult, setPublishResult] = useState<{ ok?: boolean; webhook?: string }>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const json = exportWorkspace()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `chatflow-${workspace.name}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { importWorkspace(ev.target?.result as string) }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handlePublish = async () => {
    setPublishStatus('idle')
    setPublishError('')
    publish()

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setPublishStatus('success')
        setPublishResult(data)
        setTimeout(() => { setPublishStatus('idle'); setPublishResult({}) }, 8000)
      } else {
        setPublishStatus('error')
        setPublishError(data.error || `Error ${res.status}`)
        setTimeout(() => { setPublishStatus('idle'); setPublishError('') }, 5000)
      }
    } catch (err: unknown) {
      setPublishStatus('error')
      setPublishError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor')
      setTimeout(() => { setPublishStatus('idle'); setPublishError('') }, 5000)
    }
  }

  return (
    <>
      <div className="h-9 flex items-center justify-between px-2 bg-[var(--flow-surface)] border-b border-[var(--flow-border)] shrink-0">
        <div className="flex items-center gap-1.5">
          <button onClick={onToggleSidebar}
            className="p-1 rounded hover:bg-[var(--flow-surface2)] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)]">
            <PanelLeft size={13} />
          </button>
          <div className="h-4 w-px bg-[var(--flow-border)]" />
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">CF</span>
            </div>
            <span className="text-xs font-semibold text-[var(--flow-text)]">ChatFlow Builder</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button onClick={save}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-[var(--flow-text-muted)] hover:bg-[var(--flow-surface2)] hover:text-[var(--flow-text)]">
            <Save size={11} /> Guardar
          </button>

          <button onClick={handlePublish}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors ${
              publishStatus === 'success'
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : publishStatus === 'error'
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20'
            }`}>
            {publishStatus === 'success' ? <CheckCircle size={11} /> :
             publishStatus === 'error' ? <XCircle size={11} /> :
             <Play size={11} />}
            {publishStatus === 'success' ? 'Publicado' :
             publishStatus === 'error' ? 'Error' : 'Publicar'}
          </button>

          <div className="h-4 w-px bg-[var(--flow-border)] mx-0.5" />
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-[var(--flow-text-muted)] hover:bg-[var(--flow-surface2)] hover:text-[var(--flow-text)]">
            <Settings size={11} /> Config
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-[var(--flow-text-muted)] hover:bg-[var(--flow-surface2)] hover:text-[var(--flow-text)]">
            <Download size={11} /> Exportar
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-[var(--flow-text-muted)] hover:bg-[var(--flow-surface2)] hover:text-[var(--flow-text)]">
            <Upload size={11} /> Importar
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </div>

      {publishStatus === 'success' && (
        <div className="flex flex-col bg-green-500/10 border-b border-green-500/20 text-[10px] text-green-400 shrink-0">
          <div className="h-7 flex items-center justify-center gap-2">
            <CheckCircle size={11} />
            <span>Publicado. Webhook: <code className="text-green-300 font-mono">{window.location.origin}/telegram-webhook</code></span>
            {publishResult.webhook && (
              <span className="text-[var(--flow-text-muted)]">| {publishResult.webhook}</span>
            )}
          </div>
        </div>
      )}

      {publishStatus === 'error' && (
        <div className="h-7 flex items-center justify-center gap-2 bg-red-500/10 border-b border-red-500/20 text-[10px] text-red-400 shrink-0">
          <XCircle size={11} />
          <span>Error al publicar{publishError ? `: ${publishError}` : ''}. ¿Está corriendo el servidor?</span>
        </div>
      )}

      {showSettings && <SettingsModal workspace={workspace} onClose={() => setShowSettings(false)} />}
    </>
  )
}

function SettingsModal({ workspace, onClose }: { workspace: ReturnType<typeof useStore.getState>['workspace']; onClose: () => void }) {
  const setBotConfig = useStore((s) => s.setBotConfig)
  const [local, setLocal] = useState(workspace.botConfig)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl bg-[var(--flow-surface)] border border-[var(--flow-border)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--flow-border)]">
          <h2 className="text-sm font-semibold text-[var(--flow-text)]">Configuración</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--flow-surface2)] text-[var(--flow-text-muted)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-2">
            <p className="text-[10px] text-amber-300 leading-relaxed">
              Las API keys se guardan en tu navegador y se envían al servidor al publicar. También puedes configurar las variables de entorno <code className="text-amber-200">TELEGRAM_BOT_TOKEN</code>, <code className="text-amber-200">DEEPSEEK_API_KEY</code>, <code className="text-amber-200">GROQ_API_KEY</code> en Netlify para mayor seguridad.
            </p>
          </div>

          <Field label="Token de Telegram" value={local.telegramToken}
            onChange={(v) => setLocal({ ...local, telegramToken: v })} type="password"
            placeholder="123456:ABC-DEF..." />
          <Field label="DeepSeek API Key" value={local.deepseekApiKey}
            onChange={(v) => setLocal({ ...local, deepseekApiKey: v })} type="password"
            placeholder="sk-..." />
          <Field label="Groq API Key" value={local.groqApiKey}
            onChange={(v) => setLocal({ ...local, groqApiKey: v })} type="password"
            placeholder="gsk_..." />
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--flow-border)]">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded text-[var(--flow-text-muted)] hover:bg-[var(--flow-surface2)]">Cancelar</button>
          <button onClick={() => { setBotConfig(local); onClose() }}
            className="px-3 py-1.5 text-xs rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/20">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flow-text-muted)]">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder}
        className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--flow-surface2)] border border-[var(--flow-border)]
                   text-[var(--flow-text)] placeholder:text-[var(--flow-text-muted)] focus:outline-none focus:border-purple-500/50" />
    </div>
  )
}
