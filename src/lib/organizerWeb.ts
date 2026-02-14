import { type OrganizeCaptureInput, type OrganizeCaptureResult, type TurboSettings } from './types'

interface ApiSuccess extends OrganizeCaptureResult {
  ok: true
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

export async function organizeCaptureWeb(settings: TurboSettings, input: OrganizeCaptureInput): Promise<OrganizeCaptureResult> {
  let response: Response
  try {
    response = await fetch('/api/ai/organize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        model: settings.ai.model,
      }),
    })
  } catch {
    throw new Error('Failed to reach Turbo Bar server for AI organize.')
  }

  const json = (await response.json()) as ApiSuccess | ApiFailure
  if (!response.ok || !('ok' in json) || json.ok !== true) {
    throw new Error(failureMessage(json as ApiFailure, 'AI organize request failed.'))
  }

  return {
    mode: json.mode,
    title: json.title,
    body: json.body,
    tags: json.tags,
    taskNow: json.taskNow,
    taskPriority: json.taskPriority,
    duePreset: json.duePreset,
    noteStatus: json.noteStatus,
    assignments: json.assignments,
    summary: json.summary,
  }
}
