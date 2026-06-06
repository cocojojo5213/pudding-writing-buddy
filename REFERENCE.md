# Reference Study: InkOS

Reference project: [Narcooo/inkos](https://github.com/Narcooo/inkos)

Checked on 2026-06-06 through the GitHub API:

- Stars: 6,932
- Forks: 1,314
- Language: TypeScript
- License: AGPL-3.0
- Description: "Autonomous novel writing AI Agent — agents write, audit, and revise novels with human review gates"

## What Is Worth Learning

InkOS treats novel writing as a controlled workflow instead of a single prompt. The useful product patterns are:

- Project-level truth: author intent, current focus, story bible, character matrix, hooks, summaries, resources, and emotional arcs.
- Chapter pipeline: plan the chapter, compose relevant context, draft prose, audit continuity and style, revise, then save.
- Human review gates: drafts and findings stay visible instead of being silently overwritten.
- Structured state: persistent book data is kept outside transient prompts so long-form continuity can survive.
- Multi-mode usage: CLI, web studio, and natural-language agent all call into the same underlying writing operations.

## Scope For This App

This project is an original lightweight implementation inspired by the above workflow. It does not copy InkOS source code. It keeps the parts that make a local assistant useful quickly:

- A browser writing workbench.
- Persistent local project JSON.
- Bible, characters, hooks, outline, chapters, current focus, and notes.
- Optional OpenAI-compatible model calls.
- Offline fallback helpers when no model is configured.
- Chapter planning, drafting, auditing, revision, style analysis, and Markdown export.

Sources:

- GitHub repository: https://github.com/Narcooo/inkos
- GitHub API: https://api.github.com/repos/Narcooo/inkos
- README: https://raw.githubusercontent.com/Narcooo/inkos/master/README.en.md
