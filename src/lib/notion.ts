import { Client } from '@notionhq/client'
import { DEFAULT_NOTES_DB_ID, DEFAULT_TASKS_DB_ID, type CreateNoteInput, type CreateTaskInput, type NotionCreateResult } from './types.js'

const DEFAULT_TASK_STATUS = 'Not started'
const DEFAULT_PRIORITY = 'P2 🟠'

let notionClient: Client | null = null
let tasksDbId = DEFAULT_TASKS_DB_ID
let notesDbId = DEFAULT_NOTES_DB_ID

function getNotionClient(): Client {
  if (!notionClient) {
    throw new Error('Notion client is not initialized. Set your token in Settings first.')
  }
  return notionClient
}

function bodyToParagraphBlocks(body: string | undefined): Array<Record<string, unknown>> {
  if (!body || body.trim().length === 0) {
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

export function initNotion(
  token: string,
  ids?: {
    tasksDbId?: string
    notesDbId?: string
  },
): void {
  notionClient = new Client({ auth: token })

  if (ids?.tasksDbId?.trim()) {
    tasksDbId = ids.tasksDbId
  }
  if (ids?.notesDbId?.trim()) {
    notesDbId = ids.notesDbId
  }
}

export async function createTask(input: CreateTaskInput): Promise<NotionCreateResult> {
  const notion = getNotionClient()
  const children = bodyToParagraphBlocks(input.body)
  const properties: Record<string, unknown> = {
    Task: {
      title: [{ text: { content: input.title } }],
    },
    Status: {
      status: { name: DEFAULT_TASK_STATUS },
    },
    Priority: {
      select: { name: input.priorityName ?? DEFAULT_PRIORITY },
    },
    NOW: {
      checkbox: input.now ?? false,
    },
  }

  if (input.dueISO) {
    properties.Due = {
      date: { start: input.dueISO },
    }
  }

  const payload: Record<string, unknown> = {
    parent: { database_id: tasksDbId },
    properties,
  }

  if (children.length > 0) {
    payload.children = children
  }

  const page = await notion.pages.create(payload as never)
  const url = 'url' in page ? page.url : undefined
  return { id: page.id, url }
}

export async function createNote(input: CreateNoteInput): Promise<NotionCreateResult> {
  const notion = getNotionClient()
  const children = bodyToParagraphBlocks(input.body)
  const properties: Record<string, unknown> = {
    Note: {
      title: [{ text: { content: input.title } }],
    },
    Status: {
      select: { name: input.statusName },
    },
    'Capture Type': {
      select: { name: input.captureType ?? 'Quick' },
    },
  }

  if (input.tags && input.tags.length > 0) {
    properties.Tags = {
      multi_select: input.tags.map((tag) => ({ name: tag })),
    }
  }

  const payload: Record<string, unknown> = {
    parent: { database_id: notesDbId },
    properties,
  }

  if (children.length > 0) {
    payload.children = children
  }

  const page = await notion.pages.create(payload as never)
  const url = 'url' in page ? page.url : undefined
  return { id: page.id, url }
}
