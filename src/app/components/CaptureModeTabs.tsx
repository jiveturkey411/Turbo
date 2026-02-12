import type { CaptureMode } from '../../lib/types'

const MODES: Array<{ id: CaptureMode; label: string }> = [
  { id: 'task', label: 'Task ✅' },
  { id: 'brainDump', label: 'Brain Dump 💗' },
  { id: 'inbox', label: 'Inbox Note 📥' },
]

interface CaptureModeTabsProps {
  mode: CaptureMode
  onChange: (mode: CaptureMode) => void
}

export function CaptureModeTabs({ mode, onChange }: CaptureModeTabsProps) {
  return (
    <div className="mode-tabs" role="tablist" aria-label="Capture mode tabs">
      {MODES.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={mode === tab.id}
          className={mode === tab.id ? 'mode-tab active' : 'mode-tab'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
