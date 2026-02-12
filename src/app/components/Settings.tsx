import type { TurboSettings } from '../../lib/types'

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
                setSetting({
                  ai: {
                    ...settings.ai,
                    model: event.target.value,
                  },
                })
              }
            />
          </label>

          <label className="toggle-check">
            <input
              type="checkbox"
              checked={settings.ai.autoOrganize}
              onChange={(event) =>
                setSetting({
                  ai: {
                    ...settings.ai,
                    autoOrganize: event.target.checked,
                  },
                })
              }
            />
            <span>Auto-Organize with Gemini</span>
          </label>

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
