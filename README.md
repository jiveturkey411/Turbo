# Turbo Bar

Fast capture bar for tasks + brain dumps with:
- Electron tray app (`Ctrl+Alt+Space`)
- Web/PWA mode for Notion embed
- Notion write-through (Tasks + Notes DB)
- Gemini auto-organize (mode, priority, due, tags, summary)

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
