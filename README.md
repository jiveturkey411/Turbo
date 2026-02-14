# Turbo Bar

Fast capture bar for tasks + brain dumps with:
- Electron tray app (`Ctrl+Alt+Space`)
- Web/PWA mode for Notion embed
- Notion write-through (Tasks + Notes DB)
- Gemini auto-organize and auto-assign (mode, priority, due, tags, project, goal, area, sub-area, intent, effort, energy, horizon, project status, next action, summary)

## Local development

Electron mode:
```bash
npm install
npm run dev
```

Web mode (renderer + backend API):
```bash
npm install
npm run dev:web
```
- Frontend: `http://localhost:5173`
- API server: `http://localhost:8787`

## Web deploy for Notion embed

Web mode is server-backed. Keep secrets in server env vars.

Required env vars:
- `NOTION_TOKEN`
- `GEMINI_API_KEY`

Optional env vars:
- `TASKS_DB_ID` (default already set)
- `NOTES_DB_ID` (default already set)
- `GEMINI_MODEL` (default `gemini-3-flash-preview`)
- `PORT` (default `8787`)

Build + run:
```bash
npm run build:web
npm run start:web
```

## One-click Render setup

`render.yaml` is included.

1. Push repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Set secret env vars:
   - `NOTION_TOKEN`
   - `GEMINI_API_KEY`
4. Deploy.

## Embed in Notion

1. Copy deployed URL (for example `https://your-app.onrender.com`).
2. In Notion, type `/embed`.
3. Paste URL and create embed.

The web server sets CSP `frame-ancestors` for Notion domains so iframe embedding is allowed.

## API endpoints (web mode)

- `GET /api/health`
- `POST /api/notion/create-task`
- `POST /api/notion/create-note`
- `POST /api/ai/organize`

## Notes

- Electron mode still uses local Settings for tokens.
- Web mode uses server env vars for secrets.
- For notes, AI assignments are also written as tags (for example `project/...`, `goal/...`, `area/...`).
- For tasks, AI assignments are appended to the task body in an `AI Assignments` block.
- Assignment fields can also map into dedicated Notion properties (Task DB and Note DB) via Settings > `AI Assignment Property Mapping`.
- Assignment property mapping supports Notion `select`, `multi_select`, and `rich_text` properties.
- You can add multiple extra Task/Note databases in Settings > `Additional Databases`, then choose the target DB from the capture form before saving.
- Database IDs with or without hyphens are accepted; IDs are normalized automatically.
- AI organize keeps your current due selection unchanged, so default due stays empty unless you set one.
