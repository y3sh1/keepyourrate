# Verification record

Date: 15 November 2026 (Asia/Qyzylorda).

This file records executed checks; planned checks are explicitly pending.

| Requirement | Implementation | Verification | Status |
|---|---|---|---|
| Exact rates and deterministic swaps | Shared BigInt calculator | 22 calculation/validation unit tests | Passed |
| Public message from saved snapshot | Public-only template | 5 message unit tests | Passed |
| Persistent snapshots and separate access | Worker + D1 + independent tokens | Local API suite 8/8 with persistence write; restart read 1/1 | Passed |
| Atomic confirmation and retry | SQL conditional update | Race saves exactly one choice, identical replay, changed-choice 409, A/B isolation | Passed locally and on production |
| Responsive complete UI | Next.js editor, offer, owner status | Desktop and 390px mobile viewport; long names, invalid amount and focused error | Passed within tested layouts |
| Reproducible delivery | Lockfile, migration, README | Clean copy: npm ci, build, typecheck, 27 unit tests, fresh DB migration and 7 active API tests | Passed |
| Public production deployment | Sites + D1 | 7/7 active API tests; separate IAB/Chrome publish-copy-confirm-owner-reload flow without login | Passed |
| Client privacy | Explicit public DTO + isolated route | API, HTML/initial data and all 8 referenced JS/CSS assets; private token/fields absent | Passed locally and on production |
| Public GitHub source | 34 source files, no secrets/runtime data | Public main branch; Git push successful | Published |
| User research | Prepared 3–5 participant script | No participants contacted | Not conducted |

No economic impact or competition score is asserted.

## Executed evidence

- `npm test`: **27/27 passed** (22 calculation/validation and 5 message tests).
- `npm run typecheck` and production `npm run build`: passed.
- `npm audit --omit=dev`: zero reported production-dependency vulnerabilities at verification time.
- Local API suite with persistence write: **8/8 passed**. After stopping and restarting the Worker, targeted persistence read: **1/1 passed** with the same confirmation timestamp and scope.
- Fresh source copy excluded `.git`, dependencies, builds, `.wrangler`, environment files and test receipts. README commands installed, built and migrated successfully. Its independent local database passed **7/7 active API tests**; the separate restart test was intentionally skipped in that copy.
- Production HTTP suite: **7/7 active tests passed**. Persistence process-restart test is local-only because the hosted Worker lifecycle is platform-managed.
- Browser flow was exercised locally and on production using IAB for the editor/owner and Chrome for the anonymous client. Both confirmed the demo swap at $700 and showed the required/added/removed scope. Copied two-option and confirmed-choice messages were inspected. The $30 input change immediately showed $1,030 total, $330 full-package extra and $30 private budget shortfall.
- Invalid numeric input preserved other fields and focused the invalid field. Long names and mobile width were inspected; the 390px viewport had equal document/viewport content widths (375px excluding scrollbar), with no horizontal overflow.
- The public route's API, HTML/embedded initial data and eight referenced JS/CSS assets were checked for the owner capability and private data keys. None were present. Direct owner-API access with a client token returned 404.

## Practical limits

Browser checks used desktop Chrome/IAB and mobile viewport emulation, not physical phones or every browser. User research is a prepared procedure only. Capability links do not verify identity; no payments are processed. Drafts are now saved locally when browser storage is available; published proposals remain in D1. No real customer data was used in verification.

## Draft and link update — 15 November 2026

- Added versioned, bounded local draft storage with immediate saves and raw invalid/unfinished input preservation. Six new unit tests cover round trips, malformed/incompatible envelopes, oversized data, metadata exclusion and exact cloning. Total: **33/33 unit tests passed**.
- TypeScript check and production build passed. The unchanged server API regression suite passed **7/7 active tests locally**, including public HTML/assets privacy and race/idempotency checks. The separate historical restart test was not repeated for this UI-only change.
- Local IAB browser: changed a name and entered unfinished `700.`, reloaded and restored both exactly. Opening demo and then Continue restored the saved draft without replacing it merely on navigation.
- Checked both clipboard buttons on the publication panel and private status page: absolute client/private URLs matched their destinations and remained separate.
- Confirmed A as a $700 swap in independent Chrome, created a draft from its private page, changed expenses, published and confirmed B at $1,030. B received a different client link and started unconfirmed; A retained its $700 swap and original timestamp.
- Handoff did not retain the owner token in the new editor URL, and the new editor showed no prior publication links. Storage schema tests ensure links and confirmation are not serialized into drafts.
- Source review addressed stale asynchronous message responses and prevented publication completion from overwriting edits made while saving.
- Browser-storage denial and clipboard denial handling were inspected in source; those permission failures were not forced in the live browser.
- Production API regression: **7/7 active tests passed**, including concurrent confirmation, independent snapshots, capability isolation and public API/HTML/assets privacy.
- Repeated draft restoration and independent A/B publication in production using IAB and Chrome: unfinished price and edited name survived reload; the copied draft retained its changed expenses after another reload. A remained confirmed as a $700 swap while B was independently confirmed at $1,030. Client and private clipboard links matched on both publication and owner pages.
