import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNote, createTask, initNotion } from '../src/lib/notion.js'
import { organizeCaptureWithGemini } from '../src/lib/organizer.js'
import { getSettings, setSettings } from '../src/lib/storage.js'
import { type CreateNoteInput, type CreateTaskInput, type OrganizeCaptureInput, type TurboSettings } from '../src/lib/types.js'

const HOTKEY = 'CommandOrControl+Alt+Space'
const DEV_SERVER_URL = 'http://localhost:5173'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let userDataPath = ''

function getTrayIcon() {
  const svg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="#4d84db"/></svg>',
  )
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`)
  return icon.resize({ width: 16, height: 16 })
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 520,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#0f1724',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, '../../dist/index.html'))
  } else {
    window.loadURL(process.env.VITE_DEV_SERVER_URL ?? DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  }

  window.on('blur', () => {
    if (!window.webContents.isDevToolsOpened()) {
      window.hide()
    }
  })

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  return window
}

function showWindow(): void {
  if (!mainWindow) {
    mainWindow = createMainWindow()
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

function toggleWindow(): void {
  if (!mainWindow) {
    mainWindow = createMainWindow()
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }

  showWindow()
}

function createTray(): void {
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Turbo Bar')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Toggle Capture Bar',
      click: () => toggleWindow(),
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)
  tray.on('click', () => toggleWindow())
}

function registerHotkey(): void {
  const registered = globalShortcut.register(HOTKEY, () => toggleWindow())
  if (!registered) {
    console.error(`Failed to register global hotkey: ${HOTKEY}`)
  }
}

function wireIpcHandlers(): void {
  ipcMain.handle('storage:getSettings', () => getSettings(userDataPath))
  ipcMain.handle('storage:setSettings', (_event, settings: TurboSettings) => setSettings(userDataPath, settings))
  ipcMain.handle('ai:organizeCapture', async (_event, input: OrganizeCaptureInput) => {
    const settings = await getSettings(userDataPath)
    if (!settings.geminiApiKey.trim()) {
      throw new Error('Missing Gemini API key. Add it in Settings.')
    }

    return organizeCaptureWithGemini(settings.geminiApiKey, settings.ai.model, input)
  })

  ipcMain.handle('notion:createTask', async (_event, input: CreateTaskInput) => {
    const settings = await getSettings(userDataPath)
    if (!settings.notionToken.trim()) {
      throw new Error('Missing Notion token. Add it in Settings.')
    }

    initNotion(settings.notionToken, {
      tasksDbId: settings.tasksDbId,
      notesDbId: settings.notesDbId,
    })

    return createTask({
      ...input,
      priorityName: input.priorityName ?? settings.defaults.taskPriority,
      now: input.now ?? settings.defaults.taskNow,
    })
  })

  ipcMain.handle('notion:createNote', async (_event, input: CreateNoteInput) => {
    const settings = await getSettings(userDataPath)
    if (!settings.notionToken.trim()) {
      throw new Error('Missing Notion token. Add it in Settings.')
    }

    initNotion(settings.notionToken, {
      tasksDbId: settings.tasksDbId,
      notesDbId: settings.notesDbId,
    })

    return createNote({
      ...input,
      captureType: input.captureType ?? settings.defaults.noteCaptureType,
    })
  })
}

app.whenReady().then(async () => {
  userDataPath = app.getPath('userData')
  await getSettings(userDataPath)
  wireIpcHandlers()
  mainWindow = createMainWindow()
  createTray()
  registerHotkey()
})

app.on('activate', () => showWindow())

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
