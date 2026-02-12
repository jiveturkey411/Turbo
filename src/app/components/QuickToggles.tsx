import type { DuePreset } from '../../lib/types'

interface QuickTogglesProps {
  now: boolean
  duePreset: DuePreset
  priority: string
  onNowChange: (value: boolean) => void
  onDuePresetChange: (value: DuePreset) => void
  onPriorityChange: (value: string) => void
}

const PRIORITY_OPTIONS = ['P1 🔴', 'P2 🟠', 'P3 🟡']

export function QuickToggles({
  now,
  duePreset,
  priority,
  onNowChange,
  onDuePresetChange,
  onPriorityChange,
}: QuickTogglesProps) {
  return (
    <div className="quick-toggles">
      <label className="toggle-check">
        <input type="checkbox" checked={now} onChange={(event) => onNowChange(event.target.checked)} />
        <span>NOW</span>
      </label>

      <div className="chip-row">
        <button
          type="button"
          className={duePreset === 'today' ? 'chip active' : 'chip'}
          onClick={() => onDuePresetChange(duePreset === 'today' ? 'none' : 'today')}
        >
          Due Today
        </button>
        <button
          type="button"
          className={duePreset === 'tomorrow' ? 'chip active' : 'chip'}
          onClick={() => onDuePresetChange(duePreset === 'tomorrow' ? 'none' : 'tomorrow')}
        >
          Due Tomorrow
        </button>
      </div>

      <label className="priority-select">
        <span>Priority</span>
        <select value={priority} onChange={(event) => onPriorityChange(event.target.value)}>
          {PRIORITY_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
