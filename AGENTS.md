# Specific instructions — laudos-exemplo

> This file holds ONLY the rules specific to this repository. The
> shared rules across the precisa-saude ecosystem (tone, git, hooks,
> reviews, worktrees, source verification, test coverage, code
> conventions) live in `@precisa-saude/agent-instructions`.
>
> **Read the shared base online:**
> https://github.com/Precisa-Saude/tooling/blob/main/packages/agent-instructions/AGENTS.md
>
> Claude Code loads both files (shared base + this one) via imports in
> `CLAUDE.md`. Update the base with:
> `pnpm update @precisa-saude/agent-instructions`.

## Overview

Public, minimal example of a partner integration with the structured lab
report API (`laudos.precisa-saude.com.br/v1`): a `node:http` server that
holds the API key and forwards two routes, plus a static page that uploads,
polls and renders the Bundle. Linked from docs.precisa-saude.com.br/api/.

## Rules that keep it an example

- **Stay minimal.** No framework, no runtime dependency, no build step. The
  value of this repo is that a partner can read all of it in one sitting. A
  feature that needs a dependency belongs in the documentation, not here.
- **Mirror the contract, do not extend it.** Routes, field names and states
  come from the API's OpenAPI contract (`apps/laudos-estruturados` in the
  platform repo). When the contract changes, this repo follows; it never
  invents fields.
- **The key never reaches the browser.** `proxy.test.ts` asserts it. Keep the
  assertion when touching `public/`.
- **User-facing text in pt-BR** (page copy, README.md), with `README.en.md`
  kept in sync. Code and identifiers in English.

## Structure

```
server.ts          # reads env, starts the server
proxy.ts           # the two API routes + static files
proxy.test.ts      # vitest, real http server + fake fetch
public/index.html  # form and table
public/app.js      # upload, poll, render
```

## Commit scopes

Valid scopes: `server`, `web`, `docs`, `ci`, `deps`.

## Worktrees

No dev-server registry: this repo has a single process. Use plain
`git worktree add` for parallel sessions.
