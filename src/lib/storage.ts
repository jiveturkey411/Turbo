import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS, normalizeSettings, type TurboSettings } from './types.js'

const SETTINGS_FILE = 'settings.json'

function getSettingsPath(userDataPath: string): string {
  return path.join(userDataPath, SETTINGS_FILE)
}

export async function getSettings(userDataPath: string): Promise<TurboSettings> {
  const settingsPath = getSettingsPath(userDataPath)
  try {
    const raw = await readFile(settingsPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<TurboSettings>
    return normalizeSettings(parsed)
  } catch (error) {
    const maybeFsError = error as NodeJS.ErrnoException
    if (maybeFsError.code !== 'ENOENT') {
      console.error('Failed reading settings.json, falling back to defaults:', maybeFsError)
    }
    await setSettings(userDataPath, DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
}

export async function setSettings(userDataPath: string, settings: TurboSettings): Promise<TurboSettings> {
  const normalized = normalizeSettings(settings)
  const settingsPath = getSettingsPath(userDataPath)

  await mkdir(path.dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, JSON.stringify(normalized, null, 2), 'utf-8')

  return normalized
}
