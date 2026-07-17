# Dashboard launch inventory

`components/dashboard/dashboard-route-map.ts` is the executable source of truth for dashboard
navigation. `../capabilities.json` is the product-wide source of truth for capability state. This
document records the resulting launch surface; the structural verifier fails if any of the three
drift apart.

There are no `mixed`, `mock-only`, or `shell-only` production routes.

## Retained routes

| Route key | Canonical pathname | Classification | Capability | Backend source | Browser proof |
| --- | --- | --- | --- | --- | --- |
| `issues` | `/` | `live` | `issues` | Project-scoped issue list, dashboard health/levels/volume, event detail and timeline, and issue lifecycle mutations | `tests/e2e/mock-surface-closeout.spec.ts` |
| `alerts` | `/alerts` | `live` | `alerts` | Project-scoped alert list plus acknowledge and resolve lifecycle mutations | `tests/e2e/mock-surface-closeout.spec.ts` |
| `settings` | `/settings` | `live` | `project-settings` | Project settings/storage, organization membership, reveal-once API keys, and validated alert rules | `tests/e2e/mock-surface-closeout.spec.ts` |

All retained routes require a bearer management session. The current-session response supplies the
authorized organizations, projects, roles, and user identity. Selecting a project invalidates the
project-scoped views and refetches by the selected project ID; production client source contains no
compile-time `default` project or organization API path.

## Unavailable production surfaces

| Capability | State | Production disposition |
| --- | --- | --- |
| `performance` | `unavailable` | Route and dashboard modules removed |
| `releases` | `unavailable` | Route and dashboard modules removed |
| `ai-analysis` | `unavailable` | Panel, chat, generated fix, and controls removed |
| `notification-delivery` | `unavailable` | Email, Slack, PagerDuty, and webhook channel controls removed |
| `integrations` | `unavailable` | Settings tab and connect controls removed |
| `billing` | `unavailable` | Settings tab, prices, allowances, and paid entitlements removed |
| `enterprise-security` | `unavailable` | SSO, SCIM, session-management, and policy controls removed |
| `profile-writes` | `unavailable` | Settings edit surface removed; session identity is read-only |
| `project-creation` | `unavailable` | New-project control removed; no-project state explains the owner workflow |
| `recovery-receipts` | `unavailable` | Recovery and release verification claims removed |

Direct entry to a removed route is handled by the catch-all unavailable page and never mounts the
dashboard shell or substitutes the Issues route.

## Data-source rules

- Overview and detail records are mapped directly from Mesher responses.
- Client derivations use only live inputs. The issue chart labels its proportional severity split as
  derived from live level totals.
- Loading, empty, error, and unavailable are distinct UI states.
- Failed reads clear the affected view and show an error; they never load a realistic fallback.
- API-key secrets are revealed only by the create response and are not persisted by the client.
- Landing feature and access rows are filtered from the same capability catalog used by navigation.

## Proof

Fast structural gate:

```bash
npm --prefix mesher/client run verify:route-inventory
```

Dev and production browser proof:

```bash
npm --prefix mesher/client run test:e2e:dev -- --grep "mock surface closeout"
npm --prefix mesher/client run test:e2e:prod -- --grep "mock surface closeout"
```

Full isolated release gate:

```bash
bash scripts/verify-platform.sh
```

The structural gate rejects capability drift, removed-route return, mock-data imports, seeded product
constants, hardcoded tenant paths, unsupported public claims, and missing browser closeout coverage.
