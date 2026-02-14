import type { AssignmentPropertyTargets, DatabaseKind, ExtraDatabase, TurboSettings } from '../../lib/types'

const ASSIGNMENT_PROPERTY_FIELDS: Array<{ key: keyof AssignmentPropertyTargets; label: string }> = [
  { key: 'project', label: 'Project' },
  { key: 'goal', label: 'Goal' },
  { key: 'area', label: 'Area' },
  { key: 'subArea', label: 'Sub-Area' },
  { key: 'intent', label: 'Intent' },
  { key: 'effort', label: 'Effort' },
  { key: 'energy', label: 'Energy' },
  { key: 'horizon', label: 'Horizon' },
  { key: 'projectStatus', label: 'Project Status' },
  { key: 'nextAction', label: 'Next Action' },
]

interface SettingsProps {
  open: boolean
  isElectron: boolean
  settings: TurboSettings
  saving: boolean
  onToggle: () => void
  onSave: () => Promise<void>
  onChange: (next: TurboSettings) => void
}

export function Settings({ open, isElectron, settings, saving, onToggle, onSave, onChange }: SettingsProps) {
  const setSetting = (update: Partial<TurboSettings>) => {
    onChange({ ...settings, ...update })
  }

  const setDefault = (update: Partial<TurboSettings['defaults']>) => {
    onChange({
      ...settings,
      defaults: { ...settings.defaults, ...update },
    })
  }

  const setAi = (update: Partial<TurboSettings['ai']>) => {
    onChange({
      ...settings,
      ai: { ...settings.ai, ...update },
    })
  }

  const setAssignmentProperty = (scope: 'task' | 'note', field: keyof AssignmentPropertyTargets, value: string) => {
    setAi({
      assignmentPropertyMap: {
        ...settings.ai.assignmentPropertyMap,
        [scope]: {
          ...settings.ai.assignmentPropertyMap[scope],
          [field]: value,
        },
      },
    })
  }

  const addExtraDatabase = () => {
    const next: ExtraDatabase = {
      name: '',
      id: '',
      kind: 'note',
    }
    setSetting({
      extraDatabases: [...settings.extraDatabases, next],
    })
  }

  const setExtraDatabase = (index: number, update: Partial<ExtraDatabase>) => {
    const next = settings.extraDatabases.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item
      }
      return { ...item, ...update }
    })
    setSetting({ extraDatabases: next })
  }

  const removeExtraDatabase = (index: number) => {
    setSetting({
      extraDatabases: settings.extraDatabases.filter((_item, itemIndex) => itemIndex !== index),
    })
  }

  const setExtraDatabaseKind = (index: number, value: string) => {
    const kind: DatabaseKind = value === 'task' ? 'task' : 'note'
    setExtraDatabase(index, { kind })
  }

  return (
    <section className="settings-shell">
      <button type="button" className="settings-toggle" onClick={onToggle}>
        {open ? 'Close Settings' : 'Settings'}
      </button>

      {open && (
        <div className="settings-panel">
          {isElectron ? (
            <>
              <label>
                <span>Notion Token</span>
                <input
                  type="password"
                  placeholder="secret_xxx"
                  value={settings.notionToken}
                  onChange={(event) => setSetting({ notionToken: event.target.value })}
                />
              </label>

              <label>
                <span>Gemini API Key</span>
                <input
                  type="password"
                  placeholder="AIza..."
                  value={settings.geminiApiKey}
                  onChange={(event) => setSetting({ geminiApiKey: event.target.value })}
                />
              </label>
            </>
          ) : (
            <p className="settings-note">Web embed mode uses server-side env vars for Notion/Gemini keys.</p>
          )}

          <label>
            <span>Gemini Model</span>
            <input
              type="text"
              value={settings.ai.model}
              onChange={(event) =>
                setAi({
                  model: event.target.value,
                })
              }
            />
          </label>

          <label className="toggle-check">
            <input
              type="checkbox"
              checked={settings.ai.autoOrganize}
              onChange={(event) =>
                setAi({
                  autoOrganize: event.target.checked,
                })
              }
            />
            <span>Auto Assign on Save</span>
          </label>

          <details className="settings-subpanel">
            <summary>AI Assignment Property Mapping</summary>
            <div className="settings-subgrid">
              <h4>Task DB Properties</h4>
              {ASSIGNMENT_PROPERTY_FIELDS.map(({ key, label }) => (
                <label key={`task-${key}`}>
                  <span>{label}</span>
                  <input
                    type="text"
                    value={settings.ai.assignmentPropertyMap.task[key]}
                    onChange={(event) => setAssignmentProperty('task', key, event.target.value)}
                  />
                </label>
              ))}
              <h4>Note DB Properties</h4>
              {ASSIGNMENT_PROPERTY_FIELDS.map(({ key, label }) => (
                <label key={`note-${key}`}>
                  <span>{label}</span>
                  <input
                    type="text"
                    value={settings.ai.assignmentPropertyMap.note[key]}
                    onChange={(event) => setAssignmentProperty('note', key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </details>

          <details className="settings-subpanel">
            <summary>Additional Databases</summary>
            <div className="settings-subgrid">
              {settings.extraDatabases.length === 0 && <p className="settings-note">No extra databases yet.</p>}
              {settings.extraDatabases.map((database, index) => (
                <div key={`db-${index}`} className="db-item">
                  <label>
                    <span>Name</span>
                    <input type="text" value={database.name} onChange={(event) => setExtraDatabase(index, { name: event.target.value })} />
                  </label>
                  <label>
                    <span>Type</span>
                    <select value={database.kind} onChange={(event) => setExtraDatabaseKind(index, event.target.value)}>
                      <option value="task">Task DB</option>
                      <option value="note">Note DB</option>
                    </select>
                  </label>
                  <label>
                    <span>Database ID</span>
                    <input type="text" value={database.id} onChange={(event) => setExtraDatabase(index, { id: event.target.value })} />
                  </label>
                  <button type="button" className="button-secondary small-button" onClick={() => removeExtraDatabase(index)}>
                    Remove DB
                  </button>
                </div>
              ))}
              <button type="button" className="button-secondary" onClick={addExtraDatabase}>
                Add Database
              </button>
            </div>
          </details>

          <label>
            <span>Tasks DB ID</span>
            <input
              type="text"
              value={settings.tasksDbId}
              onChange={(event) => setSetting({ tasksDbId: event.target.value })}
            />
          </label>

          <label>
            <span>Notes DB ID</span>
            <input
              type="text"
              value={settings.notesDbId}
              onChange={(event) => setSetting({ notesDbId: event.target.value })}
            />
          </label>

          <label>
            <span>Default Task Priority</span>
            <select value={settings.defaults.taskPriority} onChange={(event) => setDefault({ taskPriority: event.target.value })}>
              <option value="P1 🔴">P1 🔴</option>
              <option value="P2 🟠">P2 🟠</option>
              <option value="P3 🟡">P3 🟡</option>
            </select>
          </label>

          <label className="toggle-check">
            <input type="checkbox" checked={settings.defaults.taskNow} onChange={(event) => setDefault({ taskNow: event.target.checked })} />
            <span>Default NOW</span>
          </label>

          <button type="button" className="button-primary" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </section>
  )
}
