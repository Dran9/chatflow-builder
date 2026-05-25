export type StepType =
  | 'trigger'
  | 'send_message'
  | 'user_input'
  | 'condition'
  | 'action'
  | 'smart_delay'
  | 'randomizer'
  | 'comment'
  | 'http_request'
  | 'start_flow'
  | 'ai_response'

export type TriggerMethod =
  | 'keyword'
  | 'default_reply'
  | 'first_contact'
  | 'button_clicked'
  | 'tag_applied'
  | 'tag_removed'
  | 'field_changed'
  | 'scheduled'
  | 'api_start'

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; caption?: string }
  | { type: 'audio'; url: string; transcription?: string }
  | { type: 'video'; url: string; caption?: string }
  | { type: 'file'; url: string }
  | { type: 'gallery'; cards: GalleryCard[] }
  | { type: 'card'; title: string; subtitle?: string; imageUrl?: string; buttons?: Button[] }

export interface GalleryCard {
  title: string
  subtitle?: string
  imageUrl?: string
  buttons?: Button[]
}

export interface Button {
  text: string
  type: 'reply' | 'url' | 'callback' | 'webapp' | 'phone' | 'copy'
  value?: string
  url?: string
  copyText?: string
}

export type UserInputType = 'text' | 'number' | 'email' | 'phone' | 'date' | 'image' | 'file' | 'location' | 'voice'

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'exists'
  | 'not_exists'
  | 'in_list'
  | 'not_in_list'
  | 'starts_with'
  | 'ends_with'
  | 'date_before'
  | 'date_after'
  | 'date_between'

export type ConditionField =
  | { source: 'tag'; name: string }
  | { source: 'custom_field'; name: string }
  | { source: 'system'; name: 'last_message' | 'first_name' | 'last_name' | 'username' | 'language_code' | 'is_premium' }
  | { source: 'sequence'; name: string }
  | { source: 'channel'; name: string }

export interface ConditionRule {
  id: string
  field: ConditionField
  operator: ConditionOperator
  value: string
  value2?: string
}

export interface ConditionBranch {
  id: string
  label: string
  rules: ConditionRule[]
  logic: 'and' | 'or'
}

export type ActionType =
  | 'set_custom_field'
  | 'clear_custom_field'
  | 'add_tag'
  | 'remove_tag'
  | 'subscribe_sequence'
  | 'unsubscribe_sequence'
  | 'notify_admin'
  | 'mark_conversation_open'
  | 'mark_conversation_closed'
  | 'send_http_request'
  | 'pause_automations'

export interface ActionItem {
  id: string
  type: ActionType
  params: Record<string, string>
}

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface HTTPHeader {
  key: string
  value: string
}

export type RandomizerMode = 'even' | 'weighted'

export interface RandomizerBranch {
  id: string
  label: string
  weight: number
}

export interface StepData {
  type: StepType
  label?: string
  stepType?: StepType

  triggerMethod?: TriggerMethod
  triggerKeywords?: string[]
  triggerFlowId?: string
  triggerButtonValue?: string
  triggerTagName?: string
  triggerFieldName?: string
  triggerCronExpression?: string

  messages?: MessageContent[]
  typingDelay?: number

  inputType?: UserInputType
  inputPrompt?: string
  inputSaveTo?: string
  inputValidation?: string
  inputErrorMessage?: string

  conditionBranches?: ConditionBranch[]
  defaultBranchLabel?: string

  actions?: ActionItem[]

  delayValue?: number
  delayUnit?: 'minutes' | 'hours' | 'days'
  delayUntilDate?: string

  randomizerMode?: RandomizerMode
  randomizerBranches?: RandomizerBranch[]

  httpMethod?: HTTPMethod
  httpUrl?: string
  httpHeaders?: HTTPHeader[]
  httpBody?: string
  httpSaveTo?: string

  targetFlowId?: string

  aiProvider?: 'deepseek'
  aiModel?: string
  aiSystemPrompt?: string
  aiTemperature?: number
  aiMaxTokens?: number
  aiContextMessages?: number

  commentText?: string
  commentColor?: string
}

export interface FlowNode {
  id: string
  type: 'step'
  position: { x: number; y: number }
  data: StepData
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  data?: {
    branchId?: string
    branchLabel?: string
  }
}

export interface BotConfig {
  telegramToken: string
  deepseekApiKey: string
  groqApiKey: string
}

export interface CustomField {
  id: string
  name: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'json'
  defaultValue: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Flow {
  id: string
  name: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  triggers: TriggerMethod[]
  keywords: string[]
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface Workspace {
  id: string
  name: string
  botConfig: BotConfig
  flows: Flow[]
  customFields: CustomField[]
  tags: Tag[]
  published: boolean
  publishedAt: number | null
}

// --- Engine Runtime Types ---

export type RunStatus =
  | 'running'
  | 'waiting_for_input'
  | 'waiting_until_time'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'handed_to_human'

export interface FlowRun {
  id: string
  contactId: string
  flowId: string
  currentNodeId: string
  status: RunStatus
  context: Record<string, unknown>
  stepsExecuted: number
  createdAt: number
  updatedAt: number
  lockedUntil: number | null
}

export interface ContactState {
  id: string
  telegramId: number
  firstName: string
  lastName?: string
  username?: string
  languageCode?: string
  isPremium?: boolean
  tags: string[]
  fields: Record<string, unknown>
  currentFlowRunId: string | null
  createdAt: number
  updatedAt: number
}
