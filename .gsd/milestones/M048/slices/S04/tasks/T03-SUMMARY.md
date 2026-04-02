---
id: T03
parent: S04
milestone: M048
provides: []
requires: []
affects: []
key_files: ["tools/skill/mesh/SKILL.md", "tools/skill/mesh/skills/clustering/SKILL.md", "tools/skill/mesh/skills/syntax/SKILL.md", "tools/skill/mesh/skills/http/SKILL.md", "scripts/tests/verify-m048-s04-skill-contract.test.mjs", ".gsd/KNOWLEDGE.md", ".gsd/DECISIONS.md"]
key_decisions: ["Centralized clustered runtime truth in `tools/skill/mesh/skills/clustering/SKILL.md` and kept `tools/skill/mesh/skills/syntax/SKILL.md` / `tools/skill/mesh/skills/http/SKILL.md` as bounded cross-links.", "Made `scripts/tests/verify-m048-s04-skill-contract.test.mjs` the authoritative drift rail for missing clustered guidance and stale legacy tokens in the auto-loaded Mesh skill bundle."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "`node --test scripts/tests/verify-m048-s04-skill-contract.test.mjs` passed. The retained verifier now proves root-skill routing, clustering sub-skill coverage, syntax/http cross-links, and rejection of stale clustered guidance tokens with per-file assertion messages."
completed_at: 2026-04-02T17:48:48.891Z
blocker_discovered: false
---

# T03: Refreshed the Mesh init-time skill bundle with a dedicated clustering guide and a retained clustered-runtime contract test.

> Refreshed the Mesh init-time skill bundle with a dedicated clustering guide and a retained clustered-runtime contract test.

## What Happened
---
id: T03
parent: S04
milestone: M048
key_files:
  - tools/skill/mesh/SKILL.md
  - tools/skill/mesh/skills/clustering/SKILL.md
  - tools/skill/mesh/skills/syntax/SKILL.md
  - tools/skill/mesh/skills/http/SKILL.md
  - scripts/tests/verify-m048-s04-skill-contract.test.mjs
  - .gsd/KNOWLEDGE.md
  - .gsd/DECISIONS.md
key_decisions:
  - Centralized clustered runtime truth in `tools/skill/mesh/skills/clustering/SKILL.md` and kept `tools/skill/mesh/skills/syntax/SKILL.md` / `tools/skill/mesh/skills/http/SKILL.md` as bounded cross-links.
  - Made `scripts/tests/verify-m048-s04-skill-contract.test.mjs` the authoritative drift rail for missing clustered guidance and stale legacy tokens in the auto-loaded Mesh skill bundle.
duration: ""
verification_result: passed
completed_at: 2026-04-02T17:48:48.905Z
blocker_discovered: false
---

# T03: Refreshed the Mesh init-time skill bundle with a dedicated clustering guide and a retained clustered-runtime contract test.

**Refreshed the Mesh init-time skill bundle with a dedicated clustering guide and a retained clustered-runtime contract test.**

## What Happened

Added a dedicated `tools/skill/mesh/skills/clustering/SKILL.md` that teaches the current source-first clustered runtime story: `@cluster` / `@cluster(N)`, `Node.start_from_env()`, `meshc init --clustered`, `meshc init --template todo-api`, runtime-owned `meshc cluster status|continuity|diagnostics`, and the bounded `HTTP.clustered(...)` surface. Updated the root Mesh skill to mention clustered runtime bootstrapping in its overview, list `skills/clustering`, and route clustered/bootstrap/operator questions there. Added a small decorator note plus cross-link in the syntax skill, expanded the HTTP skill to cover `HTTP.on_get` / `HTTP.on_post` / `HTTP.on_put` / `HTTP.on_delete` and `HTTP.clustered(handler)` / `HTTP.clustered(1, handler)` while preserving `HTTP.route(...)`, replaced the placeholder T03 verifier with a retained `node:test` contract rail, and recorded the resulting maintenance rule in `.gsd/KNOWLEDGE.md` plus the pattern decision in `.gsd/DECISIONS.md`.

## Verification

`node --test scripts/tests/verify-m048-s04-skill-contract.test.mjs` passed. The retained verifier now proves root-skill routing, clustering sub-skill coverage, syntax/http cross-links, and rejection of stale clustered guidance tokens with per-file assertion messages.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --test scripts/tests/verify-m048-s04-skill-contract.test.mjs` | 0 | ✅ pass | 1096ms |


## Deviations

Recorded the bundle-centralization choice in `.gsd/DECISIONS.md` and the retained drift-rail rule in `.gsd/KNOWLEDGE.md`; otherwise none.

## Known Issues

None.

## Files Created/Modified

- `tools/skill/mesh/SKILL.md`
- `tools/skill/mesh/skills/clustering/SKILL.md`
- `tools/skill/mesh/skills/syntax/SKILL.md`
- `tools/skill/mesh/skills/http/SKILL.md`
- `scripts/tests/verify-m048-s04-skill-contract.test.mjs`
- `.gsd/KNOWLEDGE.md`
- `.gsd/DECISIONS.md`


## Deviations
Recorded the bundle-centralization choice in `.gsd/DECISIONS.md` and the retained drift-rail rule in `.gsd/KNOWLEDGE.md`; otherwise none.

## Known Issues
None.
