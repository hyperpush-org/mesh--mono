---
depends_on: [M032]
draft: true
---

# M033: ORM Expressiveness & Schema Extras — Context Draft

**Gathered:** 2026-03-24
**Status:** Draft — needs milestone-specific discussion before planning

## Seed from Current Discussion

This milestone is the follow-on to M032. Its job is to improve the Mesh data layer based on the pressure that `mesher/` is already applying today, after M032 has cleaned up stale limitation folklore and retired the first wave of real Mesh blockers.

The user does **not** want fake portability and does **not** want a PG-only trap. The intended shape is:
- a neutral ORM and migration core
- explicit Postgres extras where the behavior is genuinely PG-specific
- explicit SQLite extras later, after the extension shape is proven

The user also does **not** want a purity chase. The target is pragmatic raw SQL / DDL reduction with a short justified keep-list, not near-zero raw SQL at any cost.

Mesher should remain behaviorally stable and serve as the proof surface rather than being redesigned.

## Likely Milestone Intent

Strengthen the Mesh ORM, query builder, Repo, and Migration surfaces so `mesher/` can stop using a large share of its current raw SQL and DDL escape hatches, while keeping vendor-specific behavior explicit instead of pretending it is portable when it is not.

## Verified Technical Findings Already Available

Current investigation found these concrete pressure points:

- `mesher/` currently has about 42 `Repo.query_raw` / `Repo.execute_raw` sites.
- The main recurring data-query gaps are:
  - computed `ON CONFLICT DO UPDATE` expressions
  - function-valued `SET` / `INSERT` expressions like `now()` and `jsonb_build_object(...)`
  - parameterized expressions inside `SELECT`
  - server-side JSONB extraction from body parameters during insert/update
  - scalar subqueries and multiple independent derived subqueries in one `SELECT`
  - query patterns around full-text search and JSONB-specific selection
- The main DDL / schema-time gaps are:
  - partitioned table creation in migrations (`PARTITION BY`)
  - runtime partition creation helpers
  - partition cleanup helpers that currently inspect `pg_inherits` / `pg_class`
  - drop-partition raw DDL paths
- The current Mesh migration runtime already has a basic neutral surface for create/drop table, add/drop/rename column, and create/drop index, plus a raw execute escape hatch.
- The current Repo and Query surfaces are already expressive for many cases, but still centered on literal field maps plus raw fragments rather than first-class expression-aware update/insert/select surfaces.

## Likely Scope

### In Scope

- improve the neutral `Repo` / `Query` / `Migration` core where the improvement is honest and reusable
- add explicit Postgres extras for the real `mesher/` pressure points
- reduce `mesher/` raw SQL and DDL pragmatically on top of those stronger surfaces
- leave a clean extension path for SQLite extras later

### Probably In Scope But Needs Dedicated Discussion

- exactly how to represent expression-valued inserts and updates
- how much subquery support belongs in the neutral core versus PG extras
- whether partition DDL should be exposed as dedicated migration extras or as a smaller explicit PG migration layer
- what the final justified keep-list of raw SQL / DDL should look like

### Out of Scope / Non-Goals

- fake portability that hides vendor-specific behavior
- a giant abstract ORM DSL disconnected from real dogfood pressure
- near-zero raw SQL as a purity target
- product redesign in `mesher/`

## Dependency on M032

M033 depends on M032 to leave behind:
- a truthful retained-limit ledger instead of stale workaround folklore
- a clean separation between Mesh-language/tooling blockers and ORM/migration capability gaps
- a stable audited `mesher/` surface so M033 is expanding the right APIs rather than preserving old folklore

## What "Done" Likely Means

- the neutral core is stronger without pretending all database features are portable
- PG extras cover the recurring `mesher/` pressure points cleanly enough to remove a meaningful share of current raw SQL and DDL
- `mesher/` behavior remains stable while the underlying data and migration code gets simpler
- the remaining raw SQL / DDL keep-list is short, explicit, and justified

## Open Questions For Future Discussion

- Which pressure points deserve neutral-core APIs versus explicit PG extras?
- How far should M033 go into partition-management support versus leaving a smaller trusted raw DDL keep-list?
- Which current raw SQL sites are the highest-value retirements versus acceptable long-term keep sites?
- What is the exact SQLite follow-on boundary after the PG-first wave proves the extension shape?
- Should any M033 work update the public docs / examples, or should documentation wait for a later closeout slice?
