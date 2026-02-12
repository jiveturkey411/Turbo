import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CaptureModeTabs } from './components/CaptureModeTabs'
import { QuickToggles } from './components/QuickToggles'
import { Settings } from './components/Settings'
import { createNoteWeb, createTaskWeb } from '../lib/notionWeb'
import { organizeCaptureWeb } from '../lib/organizerWeb'
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type CaptureMode,
  type CreateNoteInput,
  type CreateTaskInput,
  type DuePreset,
  type NotionCreateResult,
  type OrganizeCaptureInput,
  type OrganizeCaptureResult,
  type TurboSettings,
} from '../lib/types'

const SETTINGS_KEY = 'turbobar.settings'
const MODE_KEY = 'turbobar.lastMode'

function isCaptureMode(value: string | null): value is CaptureMode {
  return value === 'task' || value === 'brainDump' || value === 'inbox'
}

function getDueIso(preset: DuePreset): string | undefined {
  if (preset === 'none') {
    return undefined
  }

  const now = new Date()
  if (preset === 'tomorrow') {
    now.setDate(now.getDate() + 1)
  }

  return now.toISOString().slice(0, 10)
}

function normalizeTags(tags: string[]): string[] {
  const set = new Set<string>()
  for (const tag of tags) {
    const trimmed = tag.trim()
    if (trimmed.length > 0) {
      set.add(trimmed)
    }
  }
  return [...set]
}

function noteStatusForMode(mode: CaptureMode): 'Brain Dump' | 'Inbox' {
  return mode === 'inbox' ? 'Inbox' : 'Brain Dump'
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isElectron = Boolean(window.turboAPI)

  const [mode, setMode] = useState<CaptureMode>(() => {
    const fromStorage = localStorage.getItem(MODE_KEY)
    return isCaptureMode(fromStorage) ? fromStorage : 'task'
  })

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<TurboSettings>(DEFAULT_SETTINGS)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const [taskNow, setTaskNow] = useState(DEFAULT_SETTINGS.defaults.taskNow)
  const [duePreset, setDuePreset] = useState<DuePreset>('none')
  const [priority, setPriority] = useState(DEFAULT_SETTINGS.defaults.taskPriority)

  const [isSaving, setIsSaving] = useState(false)
  const [isOrganizing, setIsOrganizing] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [aiSummary, setAiSummary] = useState('')
  const [lastCreatedUrl, setLastCreatedUrl] = useState('')

  const isTaskMode = mode === 'task'
  const isNoteMode = mode === 'brainDump' || mode === 'inbox'

  const addTagTokens = useCallback(
    (raw: string) => {
      const tokens = raw
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0)

      if (tokens.length > 0) {
        setTags((current) => normalizeTags([...current, ...tokens]))
      }
      setTagInput('')
    },
    [setTags],
  )

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode)
  }, [mode])

  useEffect(() => {
    const timer = toast
      ? window.setTimeout(() => {
          setToast('')
        }, 2200)
      : undefined
    return () => {
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [toast])

  useEffect(() => {
    const consumeShareData = () => {
      if (location.pathname !== '/share') {
        return
      }

      const params = new URLSearchParams(location.search)
      const sharedTitle = params.get('title')?.trim() ?? ''
      const sharedText = params.get('text')?.trim() ?? ''
      const sharedUrl = params.get('url')?.trim() ?? ''

      if (sharedTitle) {
        setTitle(sharedTitle)
      }

      const mergedBody = [sharedText, sharedUrl].filter((part) => part.length > 0).join('\n')
      if (mergedBody) {
        setBody((current) => (current ? `${current}\n${mergedBody}` : mergedBody))
        setMode('brainDump')
      }

      navigate('/', { replace: true })
    }

    consumeShareData()
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        if (window.turboAPI) {
          const loaded = await window.turboAPI.getSettings()
          const normalized = normalizeSettings(loaded)
          setSettings(normalized)
          setPriority(normalized.defaults.taskPriority)
          setTaskNow(normalized.defaults.taskNow)
          return
        }

        const raw = localStorage.getItem(SETTINGS_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<TurboSettings>) : DEFAULT_SETTINGS
        const normalized = normalizeSettings(parsed)
        setSettings(normalized)
        setPriority(normalized.defaults.taskPriority)
        setTaskNow(normalized.defaults.taskNow)
      } catch (loadError) {
        console.error('Failed loading settings', loadError)
        setSettings(DEFAULT_SETTINGS)
        setPriority(DEFAULT_SETTINGS.defaults.taskPriority)
        setTaskNow(DEFAULT_SETTINGS.defaults.taskNow)
      }
    }

    void loadInitialSettings()
  }, [])

  const saveSettings = useCallback(async () => {
    const normalized = normalizeSettings(settings)
    setSettingsSaving(true)
    setError('')

    try {
      if (window.turboAPI) {
        const persisted = await window.turboAPI.setSettings(normalized)
        const finalSettings = normalizeSettings(persisted)
        setSettings(finalSettings)
        setPriority(finalSettings.defaults.taskPriority)
        setTaskNow(finalSettings.defaults.taskNow)
      } else {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized))
        setSettings(normalized)
        setPriority(normalized.defaults.taskPriority)
        setTaskNow(normalized.defaults.taskNow)
      }
      setToast('Settings saved')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings.')
    } finally {
      setSettingsSaving(false)
    }
  }, [settings])

  const clearAfterSave = useCallback(() => {
    setTitle('')
    setBody('')
    setTags([])
    setTagInput('')
    setDuePreset('none')
    setAiSummary('')
  }, [])

  const getDraftFromState = useCallback(
    (): OrganizeCaptureInput => ({
      mode,
      title: title.trim(),
      body,
      tags: normalizeTags(tags),
      taskNow,
      taskPriority: priority,
      duePreset,
    }),
    [body, duePreset, mode, priority, tags, taskNow, title],
  )

  const applyOrganizedDraft = useCallback((organized: OrganizeCaptureResult) => {
    setMode(organized.mode)
    setTitle(organized.title)
    setBody(organized.body)
    setTags(organized.tags)
    setTaskNow(organized.taskNow)
    setPriority(organized.taskPriority)
    setDuePreset(organized.duePreset)
    setAiSummary(organized.summary)
  }, [])

  const organizeDraft = useCallback(
    async (draft: OrganizeCaptureInput): Promise<OrganizeCaptureResult> => {
      if (window.turboAPI && !settings.geminiApiKey.trim()) {
        throw new Error('Add your Gemini API key in Settings first.')
      }

      setIsOrganizing(true)
      try {
        if (window.turboAPI) {
          return await window.turboAPI.organizeCapture(draft)
        }
        return await organizeCaptureWeb(settings, draft)
      } finally {
        setIsOrganizing(false)
      }
    },
    [settings],
  )

  const createCapture = useCallback(async (draft: OrganizeCaptureInput | OrganizeCaptureResult): Promise<NotionCreateResult> => {
    const cleanTitle = draft.title.trim()
    if (!cleanTitle) {
      throw new Error('Title is required.')
    }
    if (window.turboAPI && !settings.notionToken.trim()) {
      throw new Error('Add your Notion token in Settings first.')
    }

    if (draft.mode === 'task') {
      const taskPayload: CreateTaskInput = {
        title: cleanTitle,
        body: draft.body.trim() || undefined,
        dueISO: getDueIso(draft.duePreset),
        now: draft.taskNow,
        priorityName: draft.taskPriority,
      }

      if (window.turboAPI) {
        return window.turboAPI.createTask(taskPayload)
      }
      return createTaskWeb(settings, taskPayload)
    }

    const statusFromMode = noteStatusForMode(draft.mode)
    const statusName = 'noteStatus' in draft ? draft.noteStatus : statusFromMode
    const notePayload: CreateNoteInput = {
      title: cleanTitle,
      body: draft.body,
      statusName,
      tags: normalizeTags(draft.tags),
      captureType: 'Quick',
    }

    if (window.turboAPI) {
      return window.turboAPI.createNote(notePayload)
    }
    return createNoteWeb(settings, notePayload)
  }, [settings])

  const runAutoOrganize = useCallback(async () => {
    setError('')
    try {
      const draft = getDraftFromState()
      const organized = await organizeDraft(draft)
      applyOrganizedDraft(organized)
      setToast('AI organized capture')
    } catch (organizeError) {
      setError(organizeError instanceof Error ? organizeError.message : 'AI organize failed.')
    }
  }, [applyOrganizedDraft, getDraftFromState, organizeDraft])

  const saveCapture = useCallback(async (options?: { forceOrganize?: boolean }) => {
    setIsSaving(true)
    setError('')
    try {
      let draft: OrganizeCaptureInput | OrganizeCaptureResult = getDraftFromState()
      if (options?.forceOrganize || settings.ai.autoOrganize) {
        draft = await organizeDraft(draft)
        applyOrganizedDraft(draft)
      }

      const result = await createCapture(draft)
      setLastCreatedUrl(result.url ?? '')
      setToast('Saved to Notion')
      clearAfterSave()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Capture failed.')
    } finally {
      setIsSaving(false)
    }
  }, [applyOrganizedDraft, clearAfterSave, createCapture, getDraftFromState, organizeDraft, settings.ai.autoOrganize])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault()
        if (!isSaving && !isOrganizing) {
          void saveCapture()
        }
      }
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [isOrganizing, isSaving, saveCapture])

  return (
    <main className="shell">
      <div className="window-drag" />
      <header className="top-row">
        <CaptureModeTabs mode={mode} onChange={setMode} />
        <Settings
          open={settingsOpen}
          isElectron={isElectron}
          settings={settings}
          saving={settingsSaving}
          onToggle={() => setSettingsOpen((current) => !current)}
          onSave={saveSettings}
          onChange={setSettings}
        />
      </header>

      <section className="capture-form">
        {!isElectron && (
          <div className="toast info">
            Web mode uses your Turbo Bar server (`/api/*`). Keep Notion and Gemini secrets on the server, not in browser settings.
          </div>
        )}

        <label className="field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            placeholder={isTaskMode ? 'What needs doing?' : 'Capture a quick note title'}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                if (!isSaving && !isOrganizing) {
                  void saveCapture({ forceOrganize: true })
                }
              }
            }}
          />
        </label>

        <label className="field">
          <span>Body</span>
          <textarea
            rows={6}
            value={body}
            placeholder="Details, links, context..."
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault()
                if (!isSaving && !isOrganizing) {
                  void saveCapture()
                }
              }
            }}
          />
        </label>

        {isTaskMode && (
          <QuickToggles
            now={taskNow}
            duePreset={duePreset}
            priority={priority}
            onNowChange={setTaskNow}
            onDuePresetChange={setDuePreset}
            onPriorityChange={setPriority}
          />
        )}

        {isNoteMode && (
          <label className="field">
            <span>Tags</span>
            <div className="tag-editor">
              {tags.map((tag) => (
                <button key={tag} type="button" className="tag-chip" onClick={() => setTags((current) => current.filter((item) => item !== tag))}>
                  {tag} ×
                </button>
              ))}
              <input
                type="text"
                value={tagInput}
                placeholder="Type tag and press Enter"
                onChange={(event) => setTagInput(event.target.value)}
                onBlur={() => {
                  if (tagInput.trim()) {
                    addTagTokens(tagInput)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault()
                    addTagTokens(tagInput)
                  }
                }}
              />
            </div>
          </label>
        )}
      </section>

      <footer className="bottom-row">
        <div className="action-row">
          <button type="button" className="button-secondary" onClick={() => void runAutoOrganize()} disabled={isSaving || isOrganizing}>
            {isOrganizing ? 'Organizing...' : 'Auto Organize'}
          </button>
          <button type="button" className="button-primary save-btn" onClick={() => void saveCapture()} disabled={isSaving || isOrganizing}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <span className="hint">Enter in title or Ctrl+Enter to save</span>
      </footer>

      {aiSummary && <div className="ai-summary">{aiSummary}</div>}
      {error && <div className="toast error">{error}</div>}
      {toast && <div className="toast success">{toast}</div>}
      {lastCreatedUrl && (
        <a className="last-created" href={lastCreatedUrl} target="_blank" rel="noreferrer">
          Open last created
        </a>
      )}
    </main>
  )
}
