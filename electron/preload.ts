import { contextBridge, ipcRenderer } from 'electron'
import type { CreateNoteInput, CreateTaskInput, OrganizeCaptureInput, TurboAPI, TurboSettings } from '../src/lib/types.js'

const turboAPI: TurboAPI = {
  createTask: (input: CreateTaskInput) => ipcRenderer.invoke('notion:createTask', input),
  createNote: (input: CreateNoteInput) => ipcRenderer.invoke('notion:createNote', input),
  organizeCapture: (input: OrganizeCaptureInput) => ipcRenderer.invoke('ai:organizeCapture', input),
  getSettings: () => ipcRenderer.invoke('storage:getSettings'),
  setSettings: (settings: TurboSettings) => ipcRenderer.invoke('storage:setSettings', settings),
}

contextBridge.exposeInMainWorld('turboAPI', turboAPI)
