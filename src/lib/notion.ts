import { Client } from '@notionhq/client'
import {
  DEFAULT_NOTES_DB_ID,
  DEFAULT_TASKS_DB_ID,
  normalizeNotionDatabaseId,
  type AssignmentPropertyTargets,
  type CaptureAssignments,
  type CreateNoteInput,
  type CreateTaskInput,
  type NotionCreateResult,
} from './types.js'

const DEFAULT_TASK_STATUS = 'Not started'
const DEFAULT_PRIORITY = 'P2 🟠'
const DB_SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000
const ASSIGNMENT_FIELDS: Array<keyof AssignmentPropertyTargets> = [
  'project',
  'goal',
  'area',
  'subArea',
  'intent',
  'effort',
  'energy',
  'horizon',
  'projectStatus',
  'nextAction',
]
const SUPPORTED_ASSIGNMENT_PROPERTY_TYPES = new Set(['select', 'multi_select', 'rich_text'])

let notionClient: Client | null = null
let tasksDbId = DEFAULT_TASKS_DB_ID
let notesDbId = DEFAULT_NOTES_DB_ID
const databasePropertyTypeCache = new Map<string, { expiresAt: number; propertyTypes: Record<string, string> }>()

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

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizePropertyName(value: string | undefined): string {
  if (!value) {
    return ''
  }
  return value.trim()
}

async function getDatabasePropertyTypes(notion: Client, databaseId: string): Promise<Record<string, string>> {
  const now = Date.now()
  const cached = databasePropertyTypeCache.get(databaseId)
  if (cached && cached.expiresAt > now) {
    return cached.propertyTypes
  }

  const database = (await notion.databases.retrieve({ database_id: databaseId } as never)) as Record<string, unknown>
  const source = database.properties && typeof database.properties === 'object' ? (database.properties as Record<string, unknown>) : {}
  const propertyTypes: Record<string, string> = {}

  for (const [propertyName, propertyDefinition] of Object.entries(source)) {
    if (!propertyDefinition || typeof propertyDefinition !== 'object') {
      continue
    }

    const type = (propertyDefinition as Record<string, unknown>).type
    if (typeof type === 'string') {
      propertyTypes[propertyName] = type
    }
  }

  databasePropertyTypeCache.set(databaseId, {
    expiresAt: now + DB_SCHEMA_CACHE_TTL_MS,
    propertyTypes,
  })

  return propertyTypes
}

function setMappedAssignmentProperty(
  properties: Record<string, unknown>,
  propertyName: string,
  propertyType: string,
  value: string,
): void {
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

async function applyAssignmentProperties(
  notion: Client,
  databaseId: string,
  properties: Record<string, unknown>,
  assignments: CaptureAssignments | undefined,
  assignmentPropertyTargets: AssignmentPropertyTargets | undefined,
): Promise<void> {
  if (!assignments || !assignmentPropertyTargets) {
    return
  }

  const propertyTypes = await getDatabasePropertyTypes(notion, databaseId)

  for (const field of ASSIGNMENT_FIELDS) {
    const propertyName = normalizePropertyName(assignmentPropertyTargets[field])
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

export function initNotion(
  token: string,
  ids?: {
    tasksDbId?: string
    notesDbId?: string
  },
): void {
  notionClient = new Client({ auth: token })

  const normalizedTasksDbId = normalizeNotionDatabaseId(ids?.tasksDbId)
  const normalizedNotesDbId = normalizeNotionDatabaseId(ids?.notesDbId)

  if (normalizedTasksDbId) {
    tasksDbId = normalizedTasksDbId
  }
  if (normalizedNotesDbId) {
    notesDbId = normalizedNotesDbId
  }
}

export async function createTask(input: CreateTaskInput): Promise<NotionCreateResult> {
  const notion = getNotionClient()
  const targetDbId = normalizeNotionDatabaseId(input.databaseId) || tasksDbId
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
  await applyAssignmentProperties(notion, targetDbId, properties, input.assignments, input.assignmentPropertyTargets)

  const payload: Record<string, unknown> = {
    parent: { database_id: targetDbId },
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
  const targetDbId = normalizeNotionDatabaseId(input.databaseId) || notesDbId
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
  await applyAssignmentProperties(notion, targetDbId, properties, input.assignments, input.assignmentPropertyTargets)

  const payload: Record<string, unknown> = {
    parent: { database_id: targetDbId },
    properties,
  }

  if (children.length > 0) {
    payload.children = children
  }

  const page = await notion.pages.create(payload as never)
  const url = 'url' in page ? page.url : undefined
  return { id: page.id, url }
}
