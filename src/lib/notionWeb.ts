import { normalizeNotionDatabaseId, type CreateNoteInput, type CreateTaskInput, type NotionCreateResult, type TurboSettings } from './types'

interface ApiSuccess {
  ok: true
  id: string
  url?: string
}

interface ApiFailure {
  ok: false
  error?: string
  details?: string
}

function failureMessage(json: ApiFailure, fallback: string): string {
  if (json.details) {
    return `${fallback} ${json.details}`
  }
  if (json.error) {
    return `${fallback} ${json.error}`
  }
  return fallback
}

async function postApi<TPayload>(endpoint: string, payload: TPayload): Promise<NotionCreateResult> {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Failed to reach Turbo Bar server. Check your deployed web service and try again.')
  }

  const json = (await response.json()) as ApiSuccess | ApiFailure
  if (!response.ok || !('ok' in json) || json.ok !== true) {
    throw new Error(failureMessage(json as ApiFailure, `Request to ${endpoint} failed.`))
  }

  return { id: json.id, url: json.url }
}

export async function createTaskWeb(settings: TurboSettings, input: CreateTaskInput): Promise<NotionCreateResult> {
  const tasksDbId = normalizeNotionDatabaseId(input.databaseId) || settings.tasksDbId
  return postApi('/api/notion/create-task', {
    input: {
      ...input,
      priorityName: input.priorityName ?? settings.defaults.taskPriority,
      now: input.now ?? settings.defaults.taskNow,
      assignmentPropertyTargets: input.assignmentPropertyTargets ?? settings.ai.assignmentPropertyMap.task,
    },
    tasksDbId,
  })
}

export async function createNoteWeb(settings: TurboSettings, input: CreateNoteInput): Promise<NotionCreateResult> {
  const notesDbId = normalizeNotionDatabaseId(input.databaseId) || settings.notesDbId
  return postApi('/api/notion/create-note', {
    input: {
      ...input,
      captureType: input.captureType ?? settings.defaults.noteCaptureType,
      assignmentPropertyTargets: input.assignmentPropertyTargets ?? settings.ai.assignmentPropertyMap.note,
    },
    notesDbId,
  })
}
