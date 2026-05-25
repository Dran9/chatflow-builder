export const STEP_LABELS: Record<string, string> = {
  trigger: 'Inicio',
  send_message: 'Mensaje',
  user_input: 'Input',
  condition: 'Condición',
  action: 'Acción',
  smart_delay: 'Delay',
  randomizer: 'Random',
  comment: 'Nota',
  http_request: 'HTTP',
  start_flow: 'Ir a Flow',
  ai_response: 'IA',
}

export const STEP_COLORS: Record<string, string> = {
  trigger: '#f59e0b',
  send_message: '#3b82f6',
  user_input: '#06b6d4',
  condition: '#8b5cf6',
  action: '#10b981',
  smart_delay: '#f97316',
  randomizer: '#ec4899',
  comment: '#6b7280',
  http_request: '#6366f1',
  start_flow: '#14b8a6',
  ai_response: '#d946ef',
}

export const STEP_DESCRIPTIONS: Record<string, string> = {
  trigger: 'Cómo se inicia este flow',
  send_message: 'Envía mensajes al usuario',
  user_input: 'Espera respuesta del usuario',
  condition: 'Evalúa condiciones y bifurca',
  action: 'Ejecuta acciones sobre el contacto',
  smart_delay: 'Espera un tiempo antes de seguir',
  randomizer: 'Divide aleatoriamente',
  comment: 'Nota visual, no ejecutable',
  http_request: 'Petición HTTP a API externa',
  start_flow: 'Inicia otro flow',
  ai_response: 'Responde con DeepSeek IA',
}
