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
  if (typeof overrideValue === 'string' && overrideValue.trim().length > 0) {
    return overrideValue.trim()
  }
  return process.env.TASKS_DB_ID?.trim() || DEFAULT_TASKS_DB_ID
}

function resolveNotesDbId(overrideValue) {
  if (typeof overrideValue === 'string' && overrideValue.trim().length > 0) {
    return overrideValue.trim()
  }
  return process.env.NOTES_DB_ID?.trim() || DEFAULT_NOTES_DB_ID
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
    const tasksDbId = resolveTasksDbId(req.body?.tasksDbId)
    const body = typeof input.body === 'string' ? input.body : ''
    const dueISO = typeof input.dueISO === 'string' && input.dueISO.trim().length > 0 ? input.dueISO.trim() : undefined
    const now = typeof input.now === 'boolean' ? input.now : false
    const priorityName = normalizePriority(input.priorityName)

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
    const notesDbId = resolveNotesDbId(req.body?.notesDbId)
    const statusName = input.statusName === 'Inbox' ? 'Inbox' : 'Brain Dump'
    const captureType = input.captureType === 'Quick' ? 'Quick' : 'Quick'
    const tags = normalizeTags(input.tags)

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

    const draft = {
      mode: normalizeMode(input.mode, 'task'),
      title: typeof input.title === 'string' ? input.title.trim() : '',
      body: typeof input.body === 'string' ? input.body : '',
      tags: normalizeTags(input.tags),
      taskNow: typeof input.taskNow === 'boolean' ? input.taskNow : false,
      taskPriority: normalizePriority(input.taskPriority),
      duePreset: normalizeDuePreset(input.duePreset, 'none'),
    }

    if (!draft.title) {
      throw new Error('Missing or invalid "title".')
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
              required: ['mode', 'title', 'body', 'tags', 'taskNow', 'taskPriority', 'duePreset', 'noteStatus', 'summary'],
              properties: {
                mode: { type: 'STRING', enum: ['task', 'brainDump', 'inbox'] },
                title: { type: 'STRING' },
                body: { type: 'STRING' },
                tags: { type: 'ARRAY', items: { type: 'STRING' } },
                taskNow: { type: 'BOOLEAN' },
                taskPriority: { type: 'STRING', enum: ['P1 🔴', 'P2 🟠', 'P3 🟡'] },
                duePreset: { type: 'STRING', enum: ['none', 'today', 'tomorrow'] },
                noteStatus: { type: 'STRING', enum: ['Brain Dump', 'Inbox'] },
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

    res.json({
      ok: true,
      mode,
      title: typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title.trim() : draft.title,
      body: typeof parsed.body === 'string' ? parsed.body.trim() : draft.body,
      tags: normalizeTags(parsed.tags),
      taskNow: typeof parsed.taskNow === 'boolean' ? parsed.taskNow : draft.taskNow,
      taskPriority: normalizePriority(parsed.taskPriority),
      duePreset: normalizeDuePreset(parsed.duePreset, draft.duePreset),
      noteStatus: normalizeNoteStatus(parsed.noteStatus, mode),
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
