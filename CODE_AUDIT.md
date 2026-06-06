# Code Audit

This file records the current hardening pass after reading the project source with line numbers. The main objective was to find defects that could lose manuscript data, hide persistence failures, or make the writing assistant unreliable during longer novel workflows.

## Current Pass Summary

- `lib.js` lines 18 and 140-168: `DEFAULT_PROJECT` is now deep-frozen, `normalizeProject()` preserves an existing `updatedAt`, and the project schema carries a `versionToken` used for write-conflict detection.
- `lib.js` normalization helpers: legacy imported characters/hooks/outline/timeline/resources/arcs/chapters that lack ids now receive deterministic content-based fallback ids instead of fresh random ids on every read. Missing chapter `createdAt` no longer gets a new timestamp during pure normalization.
- `lib.js` lines 566-657: chapter settlement now inserts a chapter when the client sends an unsaved chapter, merges partial incoming chapter payloads with the saved chapter before extracting summary/hooks/character knowledge, preserves existing body/plan/audit fields, updates truth ledgers, records character knowledge from evidence sentences instead of only generic text, and appends character/hook/resource ledger notes instead of overwriting older state.
- `server.js` lines 63-157: API method guards now return `405` with an `Allow` header for known routes. Invalid JSON, non-object JSON request bodies, and unknown assist tasks are covered by regression tests.
- `server.js` static serving: malformed percent-encoded paths now return a plain `400 Bad request`; static files only allow `GET`/`HEAD`; `HEAD` returns headers without a body; and URL parsing uses a fixed localhost base instead of trusting the request `Host` header.
- `server.js` request parsing: JSON bodies are now assembled as buffers before UTF-8 decoding, so multibyte characters split across network chunks are not corrupted. Top-level JSON must be an object.
- `server.js` lines 189-287: corrupt `project.json` is backed up before resetting to a default project, and corrupt-backup filenames include a random suffix to avoid overwrite collisions. Missing files still bootstrap cleanly. Saves are atomic, return the exact project written to disk, tolerate stale-temp cleanup races, and rotate `versionToken` on every write.
- `server.js` lines 204-256: write routes now serialize `versionToken` checks and disk writes through one in-process queue. Concurrent same-version saves cannot both pass the check; stale project, settle, and reset writes return `409` instead of overwriting newer work. Blind writes without any version marker are also rejected when a project already exists.
- `server.js` model-call section: model responses are parsed defensively. A successful non-JSON model response now reports `Model response was not valid JSON` instead of an opaque server exception, common OpenAI-compatible output shapes are extracted consistently, model Base URLs are validated with URL parsing, and temperature/token limits are clamped server-side before proxying.
- `server.js` export/snapshot paths: snapshot filenames include a unique suffix, export filenames strip path/control characters, and Markdown headings plus ledger/list fields collapse line breaks so bad titles or state fields cannot split document structure.
- `public/app.js` lines 336-572: autosave now has `flushSave()`, save queuing, revision tracking, dirty marking for both user edits and generated results, and `versionToken` submission. Delayed autosave responses no longer overwrite newer local edits, `flushSave()` retries unsaved dirty revisions even after a previous autosave failure, stale browser sessions surface a conflict message, and user-triggered metric refresh no longer hides save/API failures.
- `public/app.js` lines 625-651: long-running actions now use a logical action lock and disable controls while active, preventing concurrent plan/draft/audit/settle flows from racing each other.
- `public/app.js` startup/model config: project operations stay disabled until `/api/project` loads, export/snapshot remain usable as local rescue paths during conflicts, model config writes and reads tolerate unavailable browser storage, and inspect-style actions no longer auto-create blank chapters.
- `public/styles.css` mobile layout: small screens now show the workspace before the configuration sidebar, keep all five main tabs visible, and preserve access to project/model controls further down the page.
- `test/core.test.js` and `test/server.test.js`: coverage now includes timestamp preservation, immutable defaults, deterministic legacy ids, first-chapter context behavior, markdown export ledger line safety, empty/partial/blank-body settlement, stale summary refresh, append-only truth ledger updates, HTTP invalid/non-object JSON, split multibyte JSON bodies, API and static method guards, `HEAD` static handling, Host-header-safe static parsing, unknown task handling, blind write rejection, malformed static paths, unique corrupt backups, non-JSON and multi-shape model responses, unique snapshots, sanitized export filenames, stale write rejection, concurrent same-token save serialization, and stale atomic-save temp cleanup.

## Residual Risks

- The settlement extractor is heuristic. It is useful for offline state capture, but it does not fully understand entity aliases, implied character knowledge, or resource quantities.
- Offline drafting remains deterministic and template-shaped. It is serviceable as a no-model fallback, but model-backed drafting is still the intended higher-quality path.
- Write-conflict protection is in-process. It protects the local single-process server used by this app; if the app is later deployed as multiple Node processes writing the same file, the same version check would need an inter-process lock or database transaction.
- Frontend behavior is still verified mainly through browser screenshots and manual runtime probes rather than dedicated DOM/unit tests.

## Verification

Latest verification commands:

```bash
npm test
node --check lib.js
node --check server.js
node --check public/app.js
```

Result: 36 tests passing, including core library tests and real HTTP API subprocess tests. Runtime checks on `http://127.0.0.1:5179` also verified health, static `POST`/`HEAD` behavior, Host-header-safe static parsing, malformed static path handling, non-object JSON rejection, empty-settle rejection, unique snapshots, sanitized export filenames, clean project restoration, and desktop/mobile screenshots.
