import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { LucideIcon } from 'lucide-react'
import { MessageCircle, HelpCircle, GitBranch, Zap, Clock, Shuffle, MessageSquare, Globe, ArrowRight, Sparkles, StickyNote } from 'lucide-react'
import type { StepData } from '@/types'
import { STEP_COLORS, STEP_LABELS } from '@/lib/step-definitions'

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

function StepNode({ data, selected }: NodeProps<StepData>) {
  const stepType = (data.stepType || data.type || 'send_message') as string
  const color = (STEP_COLORS as Record<string, string>)[stepType] || '#6b7280'
  const label = data.label || (STEP_LABELS as Record<string, string>)[stepType] || stepType
  const Icon = ICONS[stepType] || MessageCircle

  const isCondition = stepType === 'condition'
  const isRandomizer = stepType === 'randomizer'

  const handleStyle = {
    width: 7,
    height: 7,
    border: '1.5px solid var(--flow-surface)',
  }

  return (
    <div className="relative">
      {!isCondition && !isRandomizer && (
        <Handle type="target" position={Position.Top} id="default"
          style={{ ...handleStyle, top: -3.5, background: '#6b6b9a' }} />
      )}

      {isCondition && (
        <Handle type="target" position={Position.Top} id="default"
          style={{ ...handleStyle, top: -3.5, background: '#6b6b9a' }} />
      )}

      <div
        className="relative px-2.5 py-2 rounded-lg min-w-[150px] max-w-[220px] transition-all duration-150"
        style={{
          background: 'var(--flow-surface)',
          border: `1.5px solid ${selected ? color : 'var(--flow-border)'}`,
          boxShadow: selected
            ? `0 0 14px ${color}33, 0 2px 8px rgba(0,0,0,0.3)`
            : '0 1px 4px rgba(0,0,0,0.2)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
            style={{ background: `${color}22` }}
          >
            <Icon size={12} color={color} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium truncate" style={{ color: 'var(--flow-text)' }}>
              {label}
            </div>
            <div className="text-[9px] truncate" style={{ color: 'var(--flow-text-muted)' }}>
              {(STEP_LABELS as Record<string, string>)[stepType] || stepType}
            </div>
          </div>
        </div>

        {stepType === 'send_message' && data.messages && data.messages.length > 0 && (
          <div
            className="mt-1.5 text-[9px] leading-relaxed px-1.5 py-1 rounded-md line-clamp-2"
            style={{ background: 'var(--flow-surface2)', color: 'var(--flow-text-muted)' }}
          >
            {data.messages[0].type === 'text'
              ? (data.messages[0].text || '(sin texto)').slice(0, 50)
              : `[${data.messages[0].type}]`}
          </div>
        )}

        {stepType === 'comment' && data.commentText && (
          <div
            className="mt-1.5 text-[9px] leading-relaxed px-1.5 py-1 rounded-md line-clamp-2 italic"
            style={{ background: 'var(--flow-surface2)', color: 'var(--flow-text-muted)' }}
          >
            {data.commentText.slice(0, 60)}
          </div>
        )}
      </div>

      {!isCondition && !isRandomizer && (
        <Handle type="source" position={Position.Bottom} id="default"
          style={{ ...handleStyle, bottom: -3.5, background: '#6b6b9a' }} />
      )}

      {isCondition && data.conditionBranches?.map((branch, idx) => (
        <Handle key={branch.id} type="source" position={Position.Bottom} id={branch.id}
          style={{ ...handleStyle, bottom: -3.5, left: `${15 + (idx % 4) * 25}%`, background: idx === 0 ? '#10b981' : '#ef4444' }} />
      ))}

      {isRandomizer && data.randomizerBranches?.map((branch, idx) => (
        <Handle key={branch.id} type="source" position={Position.Bottom} id={branch.id}
          style={{ ...handleStyle, bottom: -3.5, left: `${15 + (idx % 4) * 25}%`, background: '#6b6b9a' }} />
      ))}
    </div>
  )
}

export default memo(StepNode)
