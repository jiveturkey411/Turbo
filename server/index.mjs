import express from 'express'
import { Client } from '@notionhq/client'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_TASKS_DB_ID = '2fa414cc-8377-81f5-bd6a-fca8633835cc'
const DEFAULT_NOTES_DB_ID = 'be1414cc-8377-82e2-a106-815f50487374'
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview'
const NOTION_VERSION = '2022-06-28'
const PORT = Number(process.env.PORT ?? 8787)
const MAX_TITLE_CHARS = 60
const MAX_NEXT_ACTION_CHARS = 120
const ASSIGNMENT_INTENT_OPTIONS = new Set(['action', 'reference', 'idea', 'planning', 'follow-up'])
const ASSIGNMENT_EFFORT_OPTIONS = new Set(['quick', 'medium', 'deep'])
const ASSIGNMENT_ENERGY_OPTIONS = new Set(['low', 'medium', 'high'])
const ASSIGNMENT_HORIZON_OPTIONS = new Set(['today', 'this-week', 'this-month', 'this-quarter', 'someday'])
const ASSIGNMENT_PROJECT_STATUS_OPTIONS = new Set(['planned', 'active', 'blocked', 'on-hold', 'complete'])
const ASSIGNMENT_FIELDS = ['project', 'goal', 'area', 'subArea', 'intent', 'effort', 'energy', 'horizon', 'projectStatus', 'nextAction']
const DEFAULT_ASSIGNMENT_PROPERTY_TARGETS = {
  project: 'Project',
  goal: 'Goal',
  area: 'Area',
  subArea: 'Sub-Area',
  intent: 'Intent',
  effort: 'Effort',
  energy: 'Energy',
  horizon: 'Horizon',
  projectStatus: 'Project Status',
  nextAction: 'Next Action',
}
const SUPPORTED_ASSIGNMENT_PROPERTY_TYPES = new Set(['select', 'multi_select', 'rich_text'])
const DB_SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000
const DEFAULT_ASSIGNMENTS = {
  project: 'General',
  goal: 'General',
  area: 'General',
  subArea: 'General',
  intent: 'action',
  effort: 'medium',
  energy: 'medium',
  horizon: 'this-week',
  projectStatus: 'planned',
  nextAction: 'Review during triage',
}
const databasePropertyTypeCache = new Map()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

const frameAncestors = [
  "'self'",
  'https://www.notion.so',
  'https://*.notion.so',
  'https://www.notion.site',
  'https://*.notion.site',
]

app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.notion.com https://generativelanguage.googleapis.com",
      `frame-ancestors ${frameAncestors.join(' ')}`,
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  res.removeHeader('X-Frame-Options')
  next()
})

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing or invalid "${fieldName}".`)
  }
  return value.trim()
}

function normalizeNotionDatabaseId(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const compact = trimmed.replace(/-/g, '')
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) {
    return trimmed
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ]
    .join('-')
    .toLowerCase()
}

function bodyToParagraphBlocks(body) {
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return []
  }

  return body.split(/\r?\n/).map((line) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: line.length > 0 ? line : ' ',
          },
        },
      ],
    },
  }))
}

function getNotionClient() {
  const token = process.env.NOTION_TOKEN?.trim()
  if (!token) {
    throw new Error('Server is missing NOTION_TOKEN.')
  }
  return new Client({ auth: token })
}

function resolveTasksDbId(overrideValue) {
  const override = normalizeNotionDatabaseId(overrideValue)
  if (override) {
    return override
  }
  return normalizeNotionDatabaseId(process.env.TASKS_DB_ID) || DEFAULT_TASKS_DB_ID
}

function resolveNotesDbId(overrideValue) {
  const override = normalizeNotionDatabaseId(overrideValue)
  if (override) {
    return override
  }
  return normalizeNotionDatabaseId(process.env.NOTES_DB_ID) || DEFAULT_NOTES_DB_ID
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return []
  }

  const set = new Set()
  for (const tag of tags) {
    if (typeof tag === 'string') {
      const trimmed = tag.trim()
      if (trimmed.length > 0) {
        set.add(trimmed)
      }
    }
  }
  return [...set]
}

function normalizePriority(priorityName) {
  if (priorityName === 'P1 🔴' || priorityName === 'P2 🟠' || priorityName === 'P3 🟡') {
    return priorityName
  }
  return 'P2 🟠'
}

function normalizeAssignmentLabel(value, fallback) {
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

function normalizeAssignmentIntent(value, fallback) {
  if (typeof value === 'string' && ASSIGNMENT_INTENT_OPTIONS.has(value)) {
    return value
  }
  return fallback
}

function normalizeAssignmentEffort(value, fallback) {
  if (typeof value === 'string' && ASSIGNMENT_EFFORT_OPTIONS.has(value)) {
    return value
  }
  return fallback
}

function normalizeAssignmentEnergy(value, fallback) {
  if (typeof value === 'string' && ASSIGNMENT_ENERGY_OPTIONS.has(value)) {
    return value
  }
  return fallback
}

function normalizeAssignmentHorizon(value, fallback) {
  if (typeof value === 'string' && ASSIGNMENT_HORIZON_OPTIONS.has(value)) {
    return value
  }
  return fallback
}

function normalizeAssignmentProjectStatus(value, fallback) {
  if (typeof value === 'string' && ASSIGNMENT_PROJECT_STATUS_OPTIONS.has(value)) {
    return value
  }
  return fallback
}

function normalizeAssignmentNextAction(value, fallback) {
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

function normalizePropertyName(value, fallback) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizeAssignmentPropertyTargets(value, fallback) {
  const source = value && typeof value === 'object' ? value : {}

  return {
    project: normalizePropertyName(source.project, fallback.project),
    goal: normalizePropertyName(source.goal, fallback.goal),
    area: normalizePropertyName(source.area, fallback.area),
    subArea: normalizePropertyName(source.subArea, fallback.subArea),
    intent: normalizePropertyName(source.intent, fallback.intent),
    effort: normalizePropertyName(source.effort, fallback.effort),
    energy: normalizePropertyName(source.energy, fallback.energy),
    horizon: normalizePropertyName(source.horizon, fallback.horizon),
    projectStatus: normalizePropertyName(source.projectStatus, fallback.projectStatus),
    nextAction: normalizePropertyName(source.nextAction, fallback.nextAction),
  }
}

function normalizeAssignments(value, mode, fallback) {
  const source = value && typeof value === 'object' ? value : {}
  const intentFallback = mode === 'task' ? 'action' : 'reference'
  const projectStatusFallback = mode === 'task' ? 'active' : 'planned'
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

function normalizeDuePreset(value, fallback) {
  if (value === 'none' || value === 'today' || value === 'tomorrow') {
    return value
  }
  return fallback
}

function normalizeMode(value, fallback) {
  if (value === 'task' || value === 'brainDump' || value === 'inbox') {
    return value
  }
  return fallback
}

function normalizeNoteStatus(value, mode) {
  if (value === 'Inbox' || value === 'Brain Dump') {
    return value
  }
  return mode === 'inbox' ? 'Inbox' : 'Brain Dump'
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function shortTitle(value) {
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

function fallbackTitleFromInput(title, body) {
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

function normalizeTitle(value, fallback) {
  if (typeof value === 'string') {
    const cleaned = shortTitle(value)
    if (cleaned.length > 0) {
      return cleaned
    }
  }

  const fallbackTitle = shortTitle(fallback)
  return fallbackTitle.length > 0 ? fallbackTitle : 'Untitled capture'
}

function hasChecklistItems(value) {
  return /(?:^|\n)\s*-\s*\[[xX ]\]\s+\S+/.test(value)
}

function fallbackSubtaskBlock() {
  return ['Suggested subtasks:', '- [ ] Clarify scope and constraints', '- [ ] Execute the core work', '- [ ] Review and finalize'].join('\n')
}

function ensureTaskBodySubtasks(mode, body) {
  const trimmedBody = typeof body === 'string' ? body.trim() : ''
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

async function getDatabasePropertyTypes(notion, databaseId) {
  const now = Date.now()
  const cached = databasePropertyTypeCache.get(databaseId)
  if (cached && cached.expiresAt > now) {
    return cached.propertyTypes
  }

  const database = await notion.databases.retrieve({ database_id: databaseId })
  const source = database?.properties && typeof database.properties === 'object' ? database.properties : {}
  const propertyTypes = {}

  for (const [propertyName, propertyDefinition] of Object.entries(source)) {
    if (propertyDefinition && typeof propertyDefinition === 'object' && typeof propertyDefinition.type === 'string') {
      propertyTypes[propertyName] = propertyDefinition.type
    }
  }

  databasePropertyTypeCache.set(databaseId, {
    expiresAt: now + DB_SCHEMA_CACHE_TTL_MS,
    propertyTypes,
  })

  return propertyTypes
}

function setMappedAssignmentProperty(properties, propertyName, propertyType, value) {
  if (!SUPPORTED_ASSIGNMENT_PROPERTY_TYPES.has(propertyType)) {
    return
  }

  if (propertyType === 'select') {
    properties[propertyName] = { select: { name: value } }
    return
  }

  if (propertyType === 'multi_select') {
    properties[propertyName] = { multi_select: [{ name: value }] }
    return
  }

  properties[propertyName] = {
    rich_text: [
      {
        type: 'text',
        text: { content: value },
      },
    ],
  }
}

async function applyAssignmentProperties(notion, databaseId, properties, assignments, propertyTargets) {
  const propertyTypes = await getDatabasePropertyTypes(notion, databaseId)

  for (const field of ASSIGNMENT_FIELDS) {
    const propertyName = normalizePropertyName(propertyTargets[field], '')
    if (!propertyName) {
      continue
    }

    const propertyType = propertyTypes[propertyName]
    if (!propertyType) {
      continue
    }

    const rawValue = assignments[field]
    if (typeof rawValue !== 'string') {
      continue
    }

    const value = compactWhitespace(rawValue)
    if (!value) {
      continue
    }

    setMappedAssignmentProperty(properties, propertyName, propertyType, value)
  }
}

function jsonError(res, status, message, details) {
  res.status(status).json({
    ok: false,
    error: message,
    details: typeof details === 'string' && details.length > 0 ? details : undefined,
  })
}

function extractResponseText(responseJson) {
  const candidates = responseJson?.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini response did not include candidates.')
  }

  const first = candidates[0]
  const parts = first?.content?.parts
  if (!Array.isArray(parts)) {
    throw new Error('Gemini content parts were missing.')
  }

  const text = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  if (!text) {
    throw new Error('Gemini response text was empty.')
  }

  return text
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
  })
})

app.post('/api/notion/create-task', async (req, res) => {
  try {
    const input = req.body?.input ?? {}
    const notion = getNotionClient()
    const title = ensureNonEmptyString(input.title, 'title')
    const tasksDbId = resolveTasksDbId(input.databaseId ?? req.body?.tasksDbId)
    const body = typeof input.body === 'string' ? input.body : ''
    const dueISO = typeof input.dueISO === 'string' && input.dueISO.trim().length > 0 ? input.dueISO.trim() : undefined
    const now = typeof input.now === 'boolean' ? input.now : false
    const priorityName = normalizePriority(input.priorityName)
    const assignments =
      input.assignments && typeof input.assignments === 'object' ? normalizeAssignments(input.assignments, 'task', DEFAULT_ASSIGNMENTS) : null
    const assignmentPropertyTargets = normalizeAssignmentPropertyTargets(input.assignmentPropertyTargets, DEFAULT_ASSIGNMENT_PROPERTY_TARGETS)

    const properties = {
      Task: {
        title: [{ text: { content: title } }],
      },
      Status: {
        status: { name: 'Not started' },
      },
      Priority: {
        select: { name: priorityName },
      },
      NOW: {
        checkbox: now,
      },
    }

    if (dueISO) {
      properties.Due = { date: { start: dueISO } }
    }
    if (assignments) {
      await applyAssignmentProperties(notion, tasksDbId, properties, assignments, assignmentPropertyTargets)
    }

    const children = bodyToParagraphBlocks(body)
    const payload = {
      parent: { database_id: tasksDbId },
      properties,
      ...(children.length > 0 ? { children } : {}),
    }

    const page = await notion.pages.create(payload)
    res.json({
      ok: true,
      id: page.id,
      url: 'url' in page ? page.url : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Task creation failed.'
    jsonError(res, 400, 'Failed to create task.', message)
  }
})

app.post('/api/notion/create-note', async (req, res) => {
  try {
    const input = req.body?.input ?? {}
    const notion = getNotionClient()
    const title = ensureNonEmptyString(input.title, 'title')
    const body = typeof input.body === 'string' ? input.body : ''
    const notesDbId = resolveNotesDbId(input.databaseId ?? req.body?.notesDbId)
    const statusName = input.statusName === 'Inbox' ? 'Inbox' : 'Brain Dump'
    const captureType = input.captureType === 'Quick' ? 'Quick' : 'Quick'
    const tags = normalizeTags(input.tags)
    const assignmentMode = statusName === 'Inbox' ? 'inbox' : 'brainDump'
    const assignments =
      input.assignments && typeof input.assignments === 'object' ? normalizeAssignments(input.assignments, assignmentMode, DEFAULT_ASSIGNMENTS) : null
    const assignmentPropertyTargets = normalizeAssignmentPropertyTargets(input.assignmentPropertyTargets, DEFAULT_ASSIGNMENT_PROPERTY_TARGETS)

    const properties = {
      Note: {
        title: [{ text: { content: title } }],
      },
      Status: {
        select: { name: statusName },
      },
      'Capture Type': {
        select: { name: captureType },
      },
      ...(tags.length > 0
        ? {
            Tags: {
              multi_select: tags.map((tag) => ({ name: tag })),
            },
          }
        : {}),
    }
    if (assignments) {
      await applyAssignmentProperties(notion, notesDbId, properties, assignments, assignmentPropertyTargets)
    }

    const children = bodyToParagraphBlocks(body)
    const payload = {
      parent: { database_id: notesDbId },
      properties,
      ...(children.length > 0 ? { children } : {}),
    }

    const page = await notion.pages.create(payload)
    res.json({
      ok: true,
      id: page.id,
      url: 'url' in page ? page.url : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Note creation failed.'
    jsonError(res, 400, 'Failed to create note.', message)
  }
})

app.post('/api/ai/organize', async (req, res) => {
  try {
    const input = req.body?.input ?? {}
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('Server is missing GEMINI_API_KEY.')
    }

    const model =
      typeof req.body?.model === 'string' && req.body.model.trim().length > 0
        ? req.body.model.trim()
        : process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL

    const modeFromInput = normalizeMode(input.mode, 'task')
    const draft = {
      mode: modeFromInput,
      title: typeof input.title === 'string' ? input.title.trim() : '',
      body: typeof input.body === 'string' ? input.body : '',
      tags: normalizeTags(input.tags),
      taskNow: typeof input.taskNow === 'boolean' ? input.taskNow : false,
      taskPriority: normalizePriority(input.taskPriority),
      duePreset: normalizeDuePreset(input.duePreset, 'none'),
      assignments: normalizeAssignments(input.assignments, modeFromInput, DEFAULT_ASSIGNMENTS),
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

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${prompt}\n\nInput JSON:\n${JSON.stringify(draft, null, 2)}` }],
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
                tags: { type: 'ARRAY', items: { type: 'STRING' } },
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
      },
    )

    if (!geminiResponse.ok) {
      const failure = await geminiResponse.text()
      throw new Error(`Gemini API failed (${geminiResponse.status}): ${failure}`)
    }

    const geminiJson = await geminiResponse.json()
    const text = extractResponseText(geminiJson)
    const parsed = JSON.parse(text)
    const mode = normalizeMode(parsed.mode, draft.mode)
    const fallbackTitle = fallbackTitleFromInput(draft.title, draft.body)
    const rawBody = typeof parsed.body === 'string' ? parsed.body : draft.body

    res.json({
      ok: true,
      mode,
      title: normalizeTitle(parsed.title, fallbackTitle),
      body: ensureTaskBodySubtasks(mode, rawBody),
      tags: normalizeTags(parsed.tags),
      taskNow: typeof parsed.taskNow === 'boolean' ? parsed.taskNow : draft.taskNow,
      taskPriority: normalizePriority(parsed.taskPriority),
      duePreset: normalizeDuePreset(parsed.duePreset, draft.duePreset),
      noteStatus: normalizeNoteStatus(parsed.noteStatus, mode),
      assignments: normalizeAssignments(parsed.assignments, mode, draft.assignments),
      summary: typeof parsed.summary === 'string' && parsed.summary.trim().length > 0 ? parsed.summary.trim() : 'Capture organized by AI.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI organize failed.'
    jsonError(res, 400, 'Failed to organize capture.', message)
  }
})

app.use(express.static(distDir, { index: false, maxAge: '1h' }))

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    jsonError(res, 404, 'API route not found.')
    return
  }

  const indexFile = path.join(distDir, 'index.html')
  if (existsSync(indexFile)) {
    res.sendFile(indexFile)
    return
  }

  res.status(503).send('Web build not found. Run "npm run build:renderer" before starting the web server.')
})

app.listen(PORT, () => {
  console.log(`Turbo Bar web server running on http://localhost:${PORT}`)
})
