# 写作助手布丁

写作助手布丁 (Pudding Writing Buddy) is a local-first novel writing workbench inspired by the workflow ideas in InkOS: keep project truth visible, plan chapters before drafting, audit drafts, revise deliberately, settle story state, and export a full writing dossier.

## Run

```bash
cd /home/ubuntu/ai-novel-copilot
npm start
```

Open:

```text
http://127.0.0.1:5179
```

## AI Setup

The app works without an API key by using deterministic offline helpers. For real AI assistance, open the "Model" panel in the app and enter any OpenAI-compatible endpoint:

- Base URL: `https://api.openai.com/v1` or a compatible proxy
- Model: for example `gpt-4.1-mini`, `gpt-5-mini`, or a local gateway model
- API key: stored only in browser localStorage and sent to the local Node server per request

The server does not persist API keys.

## Features

- Project bible, author intent, current focus, book rules, banned patterns, characters, plot hooks, outline, chapters, and notes.
- Truth ledgers for timeline, resources, and emotional arcs.
- Context Packet generation for long-form continuity before writing.
- Chapter planning from the current truth state.
- Draft generation with selected context and offline fallback.
- Continuity/style audit with quality score, length ratio, dialogue count, scene anchors, hook touch rate, repetition detection, and AI-phrase checks.
- Revision from audit findings without appending revision notes into the manuscript.
- Chapter settlement that updates chapter summaries, timeline events, character knowledge, hook status, and resource notes.
- Style fingerprint from selected chapter text.
- Markdown export of the full writing dossier, including ledgers and chapter work records.
- Snapshot backups in `data/snapshots/`.
- Local persistence in `data/project.json` using atomic writes.

## Workflow

1. Fill the `Brief`, `Board`, and `State` tabs.
2. In `Write`, create a chapter and run `Plan`.
3. Run `Context` to inspect the exact continuity packet.
4. Run `Draft`, then `Audit`, then `Revise` if needed.
5. Run `Settle` after accepting a chapter so the truth ledgers stay current.
6. Use `Export` to download the Markdown dossier or `Snapshot` to save a JSON backup.

## API

- `GET /api/health`: app status, schema version, and metrics.
- `GET /api/project`: current project JSON.
- `POST /api/project`: save project JSON.
- `GET /api/metrics`: project metrics.
- `POST /api/assist`: run `plan`, `context`, `draft`, `audit`, `revise`, `style`, `brainstorm`, or `settle`.
- `POST /api/settle`: apply chapter settlement to project state.
- `POST /api/export`: return Markdown export.
- `POST /api/snapshot`: write a snapshot under `data/snapshots/`.
- `POST /api/reset`: reset to the default sample project.

## Verification

```bash
npm test
node --check lib.js
node --check server.js
node --check public/app.js
curl -s http://127.0.0.1:5179/api/health
```

## Files

- `server.js`: no-dependency Node API and static file server.
- `public/index.html`: workbench shell.
- `public/styles.css`: responsive operational UI.
- `public/app.js`: client state and workflow actions.
- `lib.js`: shared project, prompt, audit, settlement, metrics, and export logic.
- `test/core.test.js`: API-independent regression tests.
- `CODE_AUDIT.md`: line-by-line audit notes and remediation map.
- `REFERENCE.md`: source project study and links.
- `data/project.json`: generated local project state, ignored by git by default.

## Reference

See [REFERENCE.md](REFERENCE.md) for the source project study and links.
