import {
  DEFAULT_CAPTURE_ASSIGNMENTS,
  type AssignmentEffort,
  type AssignmentEnergy,
  type AssignmentHorizon,
  type AssignmentIntent,
  type AssignmentProjectStatus,
  type CaptureAssignments,
  type DuePreset,
  type NoteStatusName,
  type OrganizeCaptureInput,
  type OrganizeCaptureResult,
} from './types.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const PRIORITY_OPTIONS = new Set(['P1 🔴', 'P2 🟠', 'P3 🟡'])
const ASSIGNMENT_INTENT_OPTIONS = new Set<AssignmentIntent>(['action', 'reference', 'idea', 'planning', 'follow-up'])
const ASSIGNMENT_EFFORT_OPTIONS = new Set<AssignmentEffort>(['quick', 'medium', 'deep'])
const ASSIGNMENT_ENERGY_OPTIONS = new Set<AssignmentEnergy>(['low', 'medium', 'high'])
const ASSIGNMENT_HORIZON_OPTIONS = new Set<AssignmentHorizon>(['today', 'this-week', 'this-month', 'this-quarter', 'someday'])
const ASSIGNMENT_PROJECT_STATUS_OPTIONS = new Set<AssignmentProjectStatus>(['planned', 'active', 'blocked', 'on-hold', 'complete'])
const MAX_TITLE_CHARS = 60
const MAX_NEXT_ACTION_CHARS = 120

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

function normalizeAssignmentLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const cleaned = compactWhitespace(value)
  if (!cleaned) {
    return fallback
  }
  if (cleaned.length <= 60) {
    return cleaned
  }
  return cleaned.slice(0, 60).trim()
}

function normalizeAssignmentIntent(value: unknown, fallback: AssignmentIntent): AssignmentIntent {
  if (typeof value === 'string' && ASSIGNMENT_INTENT_OPTIONS.has(value as AssignmentIntent)) {
    return value as AssignmentIntent
  }
  return fallback
}

function normalizeAssignmentEffort(value: unknown, fallback: AssignmentEffort): AssignmentEffort {
  if (typeof value === 'string' && ASSIGNMENT_EFFORT_OPTIONS.has(value as AssignmentEffort)) {
    return value as AssignmentEffort
  }
  return fallback
}

function normalizeAssignmentEnergy(value: unknown, fallback: AssignmentEnergy): AssignmentEnergy {
  if (typeof value === 'string' && ASSIGNMENT_ENERGY_OPTIONS.has(value as AssignmentEnergy)) {
    return value as AssignmentEnergy
  }
  return fallback
}

function normalizeAssignmentHorizon(value: unknown, fallback: AssignmentHorizon): AssignmentHorizon {
  if (typeof value === 'string' && ASSIGNMENT_HORIZON_OPTIONS.has(value as AssignmentHorizon)) {
    return value as AssignmentHorizon
  }
  return fallback
}

function normalizeAssignmentProjectStatus(value: unknown, fallback: AssignmentProjectStatus): AssignmentProjectStatus {
  if (typeof value === 'string' && ASSIGNMENT_PROJECT_STATUS_OPTIONS.has(value as AssignmentProjectStatus)) {
    return value as AssignmentProjectStatus
  }
  return fallback
}

function normalizeAssignmentNextAction(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const cleaned = compactWhitespace(value)
  if (!cleaned) {
    return fallback
  }
  if (cleaned.length <= MAX_NEXT_ACTION_CHARS) {
    return cleaned
  }
  return cleaned.slice(0, MAX_NEXT_ACTION_CHARS).trim()
}

function normalizeAssignments(
  value: unknown,
  mode: OrganizeCaptureResult['mode'],
  fallback: CaptureAssignments,
): CaptureAssignments {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const intentFallback: AssignmentIntent = mode === 'task' ? 'action' : 'reference'
  const projectStatusFallback: AssignmentProjectStatus = mode === 'task' ? 'active' : 'planned'
  const nextActionFallback = mode === 'task' ? 'Define first action step' : 'Review during triage'

  return {
    project: normalizeAssignmentLabel(source.project, fallback.project),
    goal: normalizeAssignmentLabel(source.goal, fallback.goal),
    area: normalizeAssignmentLabel(source.area, fallback.area),
    subArea: normalizeAssignmentLabel(source.subArea, fallback.subArea),
    intent: normalizeAssignmentIntent(source.intent, intentFallback),
    effort: normalizeAssignmentEffort(source.effort, fallback.effort),
    energy: normalizeAssignmentEnergy(source.energy, fallback.energy),
    horizon: normalizeAssignmentHorizon(source.horizon, fallback.horizon),
    projectStatus: normalizeAssignmentProjectStatus(source.projectStatus, projectStatusFallback),
    nextAction: normalizeAssignmentNextAction(source.nextAction, nextActionFallback),
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function shortTitle(value: string): string {
  const cleaned = compactWhitespace(value).replace(/[.!?:;,]+$/g, '').trim()
  if (!cleaned) {
    return ''
  }

  if (cleaned.length <= MAX_TITLE_CHARS) {
    return cleaned
  }

  const truncated = cleaned.slice(0, MAX_TITLE_CHARS)
  const cutAt = truncated.lastIndexOf(' ')
  if (cutAt >= 20) {
    return truncated.slice(0, cutAt).trim()
  }
  return truncated.trim()
}

function fallbackTitleFromInput(title: string, body: string): string {
  const fromTitle = shortTitle(title)
  if (fromTitle) {
    return fromTitle
  }

  const fromBody = body
    .split(/\r?\n/)
    .map((line) => shortTitle(line))
    .find((line) => line.length > 0)
  if (fromBody) {
    return fromBody
  }

  return 'Untitled capture'
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const cleaned = shortTitle(value)
    if (cleaned.length > 0) {
      return cleaned
    }
  }

  const fallbackTitle = shortTitle(fallback)
  return fallbackTitle.length > 0 ? fallbackTitle : 'Untitled capture'
}

function hasChecklistItems(value: string): boolean {
  return /(?:^|\n)\s*-\s*\[[xX ]\]\s+\S+/.test(value)
}

function fallbackSubtaskBlock(): string {
  return ['Suggested subtasks:', '- [ ] Clarify scope and constraints', '- [ ] Execute the core work', '- [ ] Review and finalize'].join('\n')
}

function ensureTaskBodySubtasks(mode: OrganizeCaptureResult['mode'], body: string): string {
  const trimmedBody = body.trim()
  if (mode !== 'task') {
    return trimmedBody
  }

  if (hasChecklistItems(trimmedBody)) {
    return trimmedBody
  }

  const subtaskBlock = fallbackSubtaskBlock()
  if (!trimmedBody) {
    return subtaskBlock
  }
  return `${trimmedBody}\n\n${subtaskBlock}`
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
- Clean title: concise and specific (3-8 words, max 60 chars). If title is weak or missing, create a better short one from body/context.
- Keep body useful but concise; preserve important details and links.
- For task mode, include a "Suggested subtasks:" section in body with 2-5 checklist lines formatted as "- [ ] ...".
- Choose tags only for note modes (brainDump/inbox). For task mode, tags can be empty.
- Always assign:
  - project, goal, area, subArea: short labels (1-4 words). Use "General" when unclear.
  - intent: one of "action", "reference", "idea", "planning", "follow-up".
  - effort: one of "quick", "medium", "deep".
  - energy: one of "low", "medium", "high".
  - horizon: one of "today", "this-week", "this-month", "this-quarter", "someday".
  - projectStatus: one of "planned", "active", "blocked", "on-hold", "complete".
  - nextAction: 3-10 words, concrete and specific.
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
          required: ['mode', 'title', 'body', 'tags', 'taskNow', 'taskPriority', 'duePreset', 'noteStatus', 'assignments', 'summary'],
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
            assignments: {
              type: 'OBJECT',
              required: ['project', 'goal', 'area', 'subArea', 'intent', 'effort', 'energy', 'horizon', 'projectStatus', 'nextAction'],
              properties: {
                project: { type: 'STRING' },
                goal: { type: 'STRING' },
                area: { type: 'STRING' },
                subArea: { type: 'STRING' },
                intent: { type: 'STRING', enum: ['action', 'reference', 'idea', 'planning', 'follow-up'] },
                effort: { type: 'STRING', enum: ['quick', 'medium', 'deep'] },
                energy: { type: 'STRING', enum: ['low', 'medium', 'high'] },
                horizon: { type: 'STRING', enum: ['today', 'this-week', 'this-month', 'this-quarter', 'someday'] },
                projectStatus: { type: 'STRING', enum: ['planned', 'active', 'blocked', 'on-hold', 'complete'] },
                nextAction: { type: 'STRING' },
              },
            },
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
  const fallbackTitle = fallbackTitleFromInput(input.title, input.body)
  const rawBody = typeof parsed.body === 'string' ? parsed.body : input.body
  const fallbackAssignments = input.assignments ?? DEFAULT_CAPTURE_ASSIGNMENTS
  return {
    mode,
    title: normalizeTitle(parsed.title, fallbackTitle),
    body: ensureTaskBodySubtasks(mode, rawBody),
    tags: normalizeTags(parsed.tags, input.tags),
    taskNow: typeof parsed.taskNow === 'boolean' ? parsed.taskNow : input.taskNow,
    taskPriority: normalizePriority(parsed.taskPriority, input.taskPriority),
    duePreset: normalizeDuePreset(parsed.duePreset, input.duePreset),
    noteStatus: normalizeNoteStatus(parsed.noteStatus, mode),
    assignments: normalizeAssignments(parsed.assignments, mode, fallbackAssignments),
    summary: typeof parsed.summary === 'string' && parsed.summary.trim().length > 0 ? parsed.summary.trim() : 'Capture organized by AI.',
  }
}
