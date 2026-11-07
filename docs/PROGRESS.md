# Progress

Status key: Not started · In progress · Completed · Tested · Blocked

## Phase 1 — Functional MVP

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Repo, CI, schema + RLS | Tested | 60 database tests, 37 unit tests. Applied to Supabase project stela-brands (London); live smoke test passed. |
| 2 | Authentication and profiles | Completed | Sign-up with email confirmation, sign-in, sign-out, protected routes; signup creates profile, studio and Starter plan. Live at stela-brands.vercel.app. |
| 3 | Dashboard | Completed | Brands by status (all, drafts, published, archived); archive, restore, delete with confirmation. Duplicate not built yet. |
| 4 | New brand flow | In progress | Name, description, website, template; plan limit enforced. Logo/asset upload and colour extraction not built yet. |
| 5 | Templates as data | Tested | Complete, Essentials, Blank applied through apply_draft_ops in database tests and from the app. |
| 6 | Block registry | In progress | 14 block types with validated props (tested). Render/Edit components not built. |
| 7 | Section editor | Not started | Database side done: nesting rules, cascade delete (tested). |
| 8 | Drag and drop | Not started | Ordering maths done: positionBetween / rebalance (tested). |
| 9 | Asset uploads | Not started | Private bucket and per-brand storage policies written; need a live Supabase project to test. |
| 10 | Colour tokens | In progress | HEX/RGB/CMYK maths, overrides, WCAG contrast (tested). UI and logo extraction not built. |
| 11 | Typography | In progress | Families, files, styles in schema with licence flag (tested). UI not built. |
| 12 | Autosave with conflict detection | In progress | Server side done: atomic batches, stale-revision refusal (tested). Client not built. |
| 13 | Live preview | Not started | |
| 14 | Publish, history, rollback, unpublish | In progress | Snapshot builder + publish/restore/unpublish functions (tested). UI not built. |
| 15 | Published guide, password | In progress | Public lookup and password check (tested). Guide pages not built. |
| 16 | Client downloads | Not started | Snapshot already separates display-only from downloadable assets (tested). |
| 17 | Entitlements | Tested | Plans in config with brief's NGN prices; limits and annual prices are proposals. |

## Decisions awaiting approval

- Starter (free) tier limits, annual prices (10 × monthly) and per-plan limits in `packages/entitlements/src/plans.ts`.
