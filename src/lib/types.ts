export const DEFAULT_TASKS_DB_ID = '2fa414cc-8377-81f5-bd6a-fca8633835cc'
export const DEFAULT_NOTES_DB_ID = 'be1414cc-8377-82e2-a106-815f50487374'

export type CaptureMode = 'task' | 'brainDump' | 'inbox'
export type DuePreset = 'none' | 'today' | 'tomorrow'

export type NoteStatusName = 'Brain Dump' | 'Inbox'
export type NoteCaptureType = 'Quick'

export interface CreateTaskInput {
  title: string
  body?: string
  dueISO?: string
  now?: boolean
  priorityName?: string
}

export interface CreateNoteInput {
  title: string
  body: string
  statusName: NoteStatusName
  tags?: string[]
  captureType?: NoteCaptureType
}

export interface NotionCreateResult {
  id: string
  url?: string
}

export interface TurboSettings {
  notionToken: string
  geminiApiKey: string
  tasksDbId: string
  notesDbId: string
  defaults: {
    taskPriority: string
    taskNow: boolean
    noteCaptureType: NoteCaptureType
  }
  ai: {
    autoOrganize: boolean
    model: string
  }
}

export const DEFAULT_SETTINGS: TurboSettings = {
  notionToken: '',
  geminiApiKey: '',
  tasksDbId: DEFAULT_TASKS_DB_ID,
  notesDbId: DEFAULT_NOTES_DB_ID,
  defaults: {
    taskPriority: 'P2 🟠',
    taskNow: false,
    noteCaptureType: 'Quick',
  },
  ai: {
    autoOrganize: true,
    model: 'gemini-3-flash-preview',
  },
}

export function normalizeSettings(candidate: Partial<TurboSettings> | null | undefined): TurboSettings {
  const defaults = candidate?.defaults
  const ai = candidate?.ai
  return {
    notionToken: typeof candidate?.notionToken === 'string' ? candidate.notionToken : '',
    geminiApiKey: typeof candidate?.geminiApiKey === 'string' ? candidate.geminiApiKey : '',
    tasksDbId:
      typeof candidate?.tasksDbId === 'string' && candidate.tasksDbId.trim().length > 0
        ? candidate.tasksDbId
        : DEFAULT_SETTINGS.tasksDbId,
    notesDbId:
      typeof candidate?.notesDbId === 'string' && candidate.notesDbId.trim().length > 0
        ? candidate.notesDbId
        : DEFAULT_SETTINGS.notesDbId,
    defaults: {
      taskPriority:
        typeof defaults?.taskPriority === 'string' && defaults.taskPriority.trim().length > 0
          ? defaults.taskPriority
          : DEFAULT_SETTINGS.defaults.taskPriority,
      taskNow: typeof defaults?.taskNow === 'boolean' ? defaults.taskNow : DEFAULT_SETTINGS.defaults.taskNow,
      noteCaptureType: defaults?.noteCaptureType === 'Quick' ? 'Quick' : DEFAULT_SETTINGS.defaults.noteCaptureType,
    },
    ai: {
      autoOrganize: typeof ai?.autoOrganize === 'boolean' ? ai.autoOrganize : DEFAULT_SETTINGS.ai.autoOrganize,
      model: typeof ai?.model === 'string' && ai.model.trim().length > 0 ? ai.model : DEFAULT_SETTINGS.ai.model,
    },
  }
}

export interface OrganizeCaptureInput {
  mode: CaptureMode
  title: string
  body: string
  tags: string[]
  taskNow: boolean
  taskPriority: string
  duePreset: DuePreset
}

export interface OrganizeCaptureResult {
  mode: CaptureMode
  title: string
  body: string
  tags: string[]
  taskNow: boolean
  taskPriority: string
  duePreset: DuePreset
  noteStatus: NoteStatusName
  summary: string
}

export interface TurboAPI {
  createTask(input: CreateTaskInput): Promise<NotionCreateResult>
  createNote(input: CreateNoteInput): Promise<NotionCreateResult>
  organizeCapture(input: OrganizeCaptureInput): Promise<OrganizeCaptureResult>
  getSettings(): Promise<TurboSettings>
  setSettings(settings: TurboSettings): Promise<TurboSettings>
}

declare global {
  interface Window {
    turboAPI?: TurboAPI
  }
}

export {}
