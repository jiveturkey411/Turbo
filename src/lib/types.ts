export const DEFAULT_TASKS_DB_ID = '2fa414cc-8377-81f5-bd6a-fca8633835cc'
export const DEFAULT_NOTES_DB_ID = 'be1414cc-8377-82e2-a106-815f50487374'

export type CaptureMode = 'task' | 'brainDump' | 'inbox'
export type DuePreset = 'none' | 'today' | 'tomorrow'
export type AssignmentIntent = 'action' | 'reference' | 'idea' | 'planning' | 'follow-up'
export type AssignmentEffort = 'quick' | 'medium' | 'deep'
export type AssignmentEnergy = 'low' | 'medium' | 'high'
export type AssignmentHorizon = 'today' | 'this-week' | 'this-month' | 'this-quarter' | 'someday'
export type AssignmentProjectStatus = 'planned' | 'active' | 'blocked' | 'on-hold' | 'complete'
export type DatabaseKind = 'task' | 'note'

export type NoteStatusName = 'Brain Dump' | 'Inbox'
export type NoteCaptureType = 'Quick'

export interface CaptureAssignments {
  project: string
  goal: string
  area: string
  subArea: string
  intent: AssignmentIntent
  effort: AssignmentEffort
  energy: AssignmentEnergy
  horizon: AssignmentHorizon
  projectStatus: AssignmentProjectStatus
  nextAction: string
}

export interface ExtraDatabase {
  name: string
  id: string
  kind: DatabaseKind
}

export interface AssignmentPropertyTargets {
  project: string
  goal: string
  area: string
  subArea: string
  intent: string
  effort: string
  energy: string
  horizon: string
  projectStatus: string
  nextAction: string
}

export interface AssignmentPropertyMap {
  task: AssignmentPropertyTargets
  note: AssignmentPropertyTargets
}

export const DEFAULT_ASSIGNMENT_PROPERTY_TARGETS: AssignmentPropertyTargets = {
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

export const DEFAULT_ASSIGNMENT_PROPERTY_MAP: AssignmentPropertyMap = {
  task: { ...DEFAULT_ASSIGNMENT_PROPERTY_TARGETS },
  note: { ...DEFAULT_ASSIGNMENT_PROPERTY_TARGETS },
}

export const DEFAULT_CAPTURE_ASSIGNMENTS: CaptureAssignments = {
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

export interface CreateTaskInput {
  title: string
  body?: string
  dueISO?: string
  now?: boolean
  priorityName?: string
  databaseId?: string
  assignments?: CaptureAssignments
  assignmentPropertyTargets?: AssignmentPropertyTargets
}

export interface CreateNoteInput {
  title: string
  body: string
  statusName: NoteStatusName
  tags?: string[]
  captureType?: NoteCaptureType
  databaseId?: string
  assignments?: CaptureAssignments
  assignmentPropertyTargets?: AssignmentPropertyTargets
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
  extraDatabases: ExtraDatabase[]
  defaults: {
    taskPriority: string
    taskNow: boolean
    noteCaptureType: NoteCaptureType
  }
  ai: {
    autoOrganize: boolean
    model: string
    assignmentPropertyMap: AssignmentPropertyMap
  }
}

export const DEFAULT_SETTINGS: TurboSettings = {
  notionToken: '',
  geminiApiKey: '',
  tasksDbId: DEFAULT_TASKS_DB_ID,
  notesDbId: DEFAULT_NOTES_DB_ID,
  extraDatabases: [],
  defaults: {
    taskPriority: 'P2 🟠',
    taskNow: false,
    noteCaptureType: 'Quick',
  },
  ai: {
    autoOrganize: true,
    model: 'gemini-3-flash-preview',
    assignmentPropertyMap: DEFAULT_ASSIGNMENT_PROPERTY_MAP,
  },
}

function normalizePropertyName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizeAssignmentPropertyTargets(
  candidate: Partial<AssignmentPropertyTargets> | null | undefined,
  fallback: AssignmentPropertyTargets,
): AssignmentPropertyTargets {
  return {
    project: normalizePropertyName(candidate?.project, fallback.project),
    goal: normalizePropertyName(candidate?.goal, fallback.goal),
    area: normalizePropertyName(candidate?.area, fallback.area),
    subArea: normalizePropertyName(candidate?.subArea, fallback.subArea),
    intent: normalizePropertyName(candidate?.intent, fallback.intent),
    effort: normalizePropertyName(candidate?.effort, fallback.effort),
    energy: normalizePropertyName(candidate?.energy, fallback.energy),
    horizon: normalizePropertyName(candidate?.horizon, fallback.horizon),
    projectStatus: normalizePropertyName(candidate?.projectStatus, fallback.projectStatus),
    nextAction: normalizePropertyName(candidate?.nextAction, fallback.nextAction),
  }
}

function normalizeExtraDatabases(value: unknown): ExtraDatabase[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized: ExtraDatabase[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const source = item as Partial<ExtraDatabase>
    const name = typeof source.name === 'string' ? source.name.trim() : ''
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    const kind: DatabaseKind = source.kind === 'task' ? 'task' : 'note'

    if (!name && !id) {
      continue
    }

    normalized.push({
      name: name || 'Unnamed DB',
      id,
      kind,
    })
  }

  return normalized
}

export function normalizeSettings(candidate: Partial<TurboSettings> | null | undefined): TurboSettings {
  const defaults = candidate?.defaults
  const ai = candidate?.ai
  const assignmentPropertyMap = ai?.assignmentPropertyMap
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
    extraDatabases: normalizeExtraDatabases(candidate?.extraDatabases),
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
      assignmentPropertyMap: {
        task: normalizeAssignmentPropertyTargets(assignmentPropertyMap?.task, DEFAULT_SETTINGS.ai.assignmentPropertyMap.task),
        note: normalizeAssignmentPropertyTargets(assignmentPropertyMap?.note, DEFAULT_SETTINGS.ai.assignmentPropertyMap.note),
      },
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
  assignments: CaptureAssignments
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
  assignments: CaptureAssignments
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
