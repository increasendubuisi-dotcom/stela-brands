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
| 6 | Block registry | Completed | Editing built for all block types except Grid (container layouts come later). |
| 7 | Section editor | Completed | Add, nest (4 levels), rename, hide, duplicate (with blocks and subsections), delete. |
| 8 | Drag and drop | In progress | Sections reorder by drag within their level (with renumbering). Blocks move up/down; block drag not built. |
| 9 | Asset uploads | Completed | Browser uploads to private storage, library with categories, client-download flag. Deleting keeps the stored file (live versions may use it); orphan cleanup later. |
| 10 | Colour tokens | Completed | Add, edit, group, reorder, delete (cleans blocks), HEX/RGB/CMYK with overrides, Pantone, copy values, extraction from an image in the browser, WCAG contrast on combinations. |
| 11 | Typography | Completed | Google, system and uploaded font files (weight/style read from file names, licence flag gates downloads). |
| 12 | Autosave with conflict detection | Tested | Merged batches, one save in flight, retry when offline, stops on conflict; editing session replayed through the database in tests. |
| 13 | Live preview | Completed | /preview renders the draft through the same renderer as the live guide. |
| 14 | Publish, history, rollback, unpublish | Completed | Publish panel with notes, version history, restore, access settings; plan limit on live guides. |
| 15 | Published guide, password | Completed | /g/<slug>, password unlock (httpOnly cookie, checked by the database each visit). Files need SUPABASE_SERVICE_ROLE_KEY in Vercel. |
| 16 | Client downloads | Completed | Single files via short-lived signed links; Download all zips in the browser. Needs SUPABASE_SERVICE_ROLE_KEY. |
| 17 | Entitlements | Tested | Plans in config with brief's NGN prices; limits and annual prices are proposals. |

## Decisions awaiting approval

- Starter (free) tier limits, annual prices (10 × monthly) and per-plan limits in `packages/entitlements/src/plans.ts`.
