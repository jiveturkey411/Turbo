import { type DuePreset, type NoteStatusName, type OrganizeCaptureInput, type OrganizeCaptureResult } from './types.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const PRIORITY_OPTIONS = new Set(['P1 🔴', 'P2 🟠', 'P3 🟡'])

function normalizeDuePreset(value: unknown, fallback: DuePreset): DuePreset {
  if (value === 'today' || value === 'tomorrow' || value === 'none') {
    return value
  }
  return fallback
}

function normalizeNoteStatus(value: unknown, mode: OrganizeCaptureResult['mode']): NoteStatusName {
  if (value === 'Inbox' || value === 'Brain Dump') {
    return value
  }
  return mode === 'inbox' ? 'Inbox' : 'Brain Dump'
}

function normalizeMode(value: unknown, fallback: OrganizeCaptureResult['mode']): OrganizeCaptureResult['mode'] {
  if (value === 'task' || value === 'brainDump' || value === 'inbox') {
    return value
  }
  return fallback
}

function normalizePriority(value: unknown, fallback: string): string {
  if (typeof value === 'string' && PRIORITY_OPTIONS.has(value)) {
    return value
  }
  return fallback
}

function normalizeTags(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const set = new Set<string>()
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed.length > 0) {
        set.add(trimmed)
      }
    }
  }
  return [...set]
}

function extractResponseText(responseJson: Record<string, unknown>): string {
  const candidates = responseJson.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini response did not include candidates.')
  }

  const first = candidates[0]
  if (!first || typeof first !== 'object') {
    throw new Error('Gemini candidate format was invalid.')
  }

  const content = (first as Record<string, unknown>).content
  if (!content || typeof content !== 'object') {
    throw new Error('Gemini candidate content was missing.')
  }

  const parts = (content as Record<string, unknown>).parts
  if (!Array.isArray(parts)) {
    throw new Error('Gemini content parts were missing.')
  }

  const text = parts
    .map((part) => {
      if (part && typeof part === 'object' && 'text' in part) {
        const partText = (part as Record<string, unknown>).text
        return typeof partText === 'string' ? partText : ''
      }
      return ''
    })
    .join('')
    .trim()

  if (!text) {
    throw new Error('Gemini response text was empty.')
  }
  return text
}

export async function organizeCaptureWithGemini(
  apiKey: string,
  model: string,
  input: OrganizeCaptureInput,
): Promise<OrganizeCaptureResult> {
  if (!apiKey.trim()) {
    throw new Error('Missing Gemini API key.')
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const prompt = `
You are Turbo Bar's capture organizer.
Input is a rough brain dump/task capture. Return structured JSON only.

Rules:
- Choose mode:
  - "task" when this is an actionable item someone should do.
  - "brainDump" when this is a thought/reference/idea for later.
  - "inbox" when it is a note that still needs review/triage.
- Clean title: concise and specific.
- Keep body useful but concise; preserve important details and links.
- Choose tags only for note modes (brainDump/inbox). For task mode, tags can be empty.
- taskPriority must be one of: "P1 🔴", "P2 🟠", "P3 🟡".
- duePreset must be one of: "none", "today", "tomorrow", relative to ${todayISO}.
- noteStatus must be "Brain Dump" or "Inbox".
- summary should be one short sentence explaining the categorization.
`

  const endpoint = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${prompt}\n\nInput JSON:\n${JSON.stringify(input, null, 2)}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          required: ['mode', 'title', 'body', 'tags', 'taskNow', 'taskPriority', 'duePreset', 'noteStatus', 'summary'],
          properties: {
            mode: { type: 'STRING', enum: ['task', 'brainDump', 'inbox'] },
            title: { type: 'STRING' },
            body: { type: 'STRING' },
            tags: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            taskNow: { type: 'BOOLEAN' },
            taskPriority: { type: 'STRING', enum: ['P1 🔴', 'P2 🟠', 'P3 🟡'] },
            duePreset: { type: 'STRING', enum: ['none', 'today', 'tomorrow'] },
            noteStatus: { type: 'STRING', enum: ['Brain Dump', 'Inbox'] },
            summary: { type: 'STRING' },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gemini API failed (${response.status}): ${text}`)
  }

  const responseJson = (await response.json()) as Record<string, unknown>
  const text = extractResponseText(responseJson)
  const parsed = JSON.parse(text) as Partial<OrganizeCaptureResult>

  const mode = normalizeMode(parsed.mode, input.mode)
  return {
    mode,
    title: typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title.trim() : input.title.trim(),
    body: typeof parsed.body === 'string' ? parsed.body.trim() : input.body,
    tags: normalizeTags(parsed.tags, input.tags),
    taskNow: typeof parsed.taskNow === 'boolean' ? parsed.taskNow : input.taskNow,
    taskPriority: normalizePriority(parsed.taskPriority, input.taskPriority),
    duePreset: normalizeDuePreset(parsed.duePreset, input.duePreset),
    noteStatus: normalizeNoteStatus(parsed.noteStatus, mode),
    summary: typeof parsed.summary === 'string' && parsed.summary.trim().length > 0 ? parsed.summary.trim() : 'Capture organized by AI.',
  }
}
