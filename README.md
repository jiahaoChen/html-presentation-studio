# HTML Presentation Studio

**AI Skill + HTML slides + browser editor + precise per-element modifications.** A dependency-free MVP for presentations that can be edited manually without hand-writing HTML, while remaining easy for AI agents to modify safely.

## Quick start

Requires Node.js **20+**. No `npm install` is necessary.

```bash
npm run dev
```

Open **http://127.0.0.1:4173** in a browser.

- Select a slide from the left thumbnail strip.
- Click an element to select it; drag to move it, or adjust position, size and font properties in the inspector.
- Double-click a `data-editable="text"` element to edit in place, or use the inspector's text box.
- Click **儲存此頁** (or Ctrl/Cmd+S) to write only that page back to `slides/<id>.html`.
- Click **匯出 HTML** to download a standalone offline presentation.
- Click **播放** to navigate the slides (arrow keys, Esc to leave).

## Architecture

```text
                         Manual browser edits
                                |
             +------------------v-------------------+
             |  localhost:4173 visual editor        |
             |  select, drag, edit, inspect          |
             +------------------+-------------------+
                                | GET/PUT + SHA-256
                           slides/*.html <---- AI Agent / SKILL.md
                                |                      |
                              deck.json          target element ID
                                |                      |
                     npm run validate / test <---------+
                                |
                     HTML offline exporter
```

## Agent workflow

Each slide is a separate HTML fragment with stable `data-slide-id` and `data-element-id`. For a targeted text change:

```bash
node scripts/agent-edit.mjs \
  --slide s04-precision \
  --element demo-callout \
  --text "已完成精準修改"

npm run validate
npm test
npm run export
```

The text-edit CLI preserves all unrelated markup, and escapes injected HTML. For a chart or complex component, the agent edits only that component inside the corresponding slide file; the `SKILL.md` requires checking the one-slide diff and validation.

## File layout

```text
html-presentation-studio/
├── SKILL.md                   AI editor rules
├── AGENTS.md                  coding-agent repository guardrails
├── deck.json                  ordered slide manifest
├── slides/*.html              independent 1280x720 HTML slides
├── public/index.html          browser editor UI
├── public/app.js              selection / drag / inspector / save
├── public/editor.css          application styling
├── public/theme.css           reusable presentation design system
├── lib/deck.mjs               validation / storage / standalone export
├── lib/patch.mjs              stable-ID text edit helper
├── server.mjs                 localhost-only HTTP API
├── scripts/                   agent edit / validation / export commands
└── tests/                     Node built-in tests
```

## API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/deck` | Ordered slide metadata |
| GET | `/api/slides/:id` | Fragment HTML and SHA-256 hash |
| PUT | `/api/slides/:id` | Save one slide with `expectedHash`; HTTP 409 on conflict |
| GET | `/api/export` | Download self-contained presentation HTML |

## MVP scope and limitations

**Supported:** independent slide sources, stable IDs, text edits, drag/reposition, size and font inspector, save with optimistic concurrency, slide previews, local playback and offline HTML export. No app dependencies.

**Not supported yet:** drag-to-resize handles (dimensions can be changed in the inspector), arbitrary JS inside slides, remote images, PPTX round-trip, undo history, real-time multi-user collaboration, and deployment with authentication. The server binds to **127.0.0.1 only**. Do not expose it publicly; input checks are not a full HTML sanitizer.

The editor preserves on-disk slide files, but browser DOM serialization when saving may normalize an edited slide's markup. Review Git diffs before accepting changes made by AI and humans in parallel.

## Version control

Treat saved slide HTML files as source of truth. Commit source files, not `dist/`. The exported `dist/presentation.html` is reproducible.

```bash
git init
git add .
git commit -m "feat: initial HTML Presentation Studio MVP"
# Create a new private empty repository on GitHub, then:
git remote add origin https://github.com/YOUR_NAME/html-presentation-studio.git
git branch -M main
git push -u origin main
```

## Publish a new GitHub repository

The GitHub connector in this runtime cannot create new repositories. After downloading the project, sign into GitHub CLI locally (`gh auth login`) and run:

```bash
bash scripts/publish-github.sh
```

The script creates **private** `jiahaoChen/html-presentation-studio` and pushes the source. It refuses to overwrite an existing repository. Set `REPO_OWNER` and `REPO_NAME` to customize.