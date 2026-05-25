const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'
const GROQ_BASE = 'https://api.groq.com/openai/v1'

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function deepseekChat(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek error ${res.status}: ${err}`)
  }

  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content || ''
}

export async function groqTranscribe(apiKey: string, audioUrl: string): Promise<string> {
  const audioRes = await fetch(audioUrl)
  const audioBlob = await audioRes.blob()

  const form = new FormData()
  form.append('file', audioBlob, 'audio.ogg')
  form.append('model', 'whisper-large-v3-turbo')

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq Whisper error ${res.status}: ${err}`)
  }

  const data = await res.json() as { text: string }
  return data.text || ''
}
