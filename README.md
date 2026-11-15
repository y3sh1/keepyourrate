# KeepYourRate

[Live application](https://keepyourrate-cup-two.buffforum64.chatgpt.site) · [Public source](https://github.com/y3sh1/keepyourrate)

An English-language, USD web MVP for fixed-price service work. Turn an extra client request into a paid add-on or a scope swap, publish an immutable proposal, and let the client confirm the agreed price and work. No registration, payment collection, AI, or message sending.

The calculated hourly rate is after the direct expenses entered and depends on the entered time. Offers protect the **chosen minimum**, which may be below the original effective rate.

The editor shows the **resulting rate for each option**, using that option's final price, remaining expenses and work time. A label verifies the minimum using exact integer comparisons; only the displayed rate is rounded. These rates are editor-only and are never included in public options, the client page or client messages. A lower chosen minimum is explicitly distinguished from the original rate.

After publication, **Preview message to client** opens a read-only preview beside the copy button, also available on the private status page. Preview and copy use the same saved public snapshot and template, so unpublished edits cannot change the message. Opening or copying checks the latest status; an open preview refreshes every five seconds while visible and on return to the tab. After confirmation it describes only the agreed option. Connection errors hide an unverified preview and offer a retry without clearing the draft or saved proposal.

## Drafts and reusing a proposal

Edits autosave immediately in this browser, including unfinished or invalid text. Reloading restores the draft; **Continue your draft** returns to it. Opening a demo or blank project alone does not overwrite the saved copy; editing the new project replaces it. Drafts are device-local, contain your private working inputs, and do not include access links or confirmation. Browser storage must be available; failures are shown without clearing the current inputs. Clearing site data removes the saved draft.

On a private status page, **Create a new proposal from this** copies the original saved inputs into the editor. It uses a one-use same-tab handoff without putting private data or tokens in the URL. Publishing creates a separate proposal with new links and no inherited confirmation. The original remains unchanged. This action copies the original inputs, not a new baseline derived from the client's selected scope.

**Copy client link** and **Copy private link** are available after publication and on the private status page. A selectable fallback field appears if clipboard access fails. Save the private link somewhere private; only share the client link.

## Run the complete application

Requires Node.js 22.13+ and npm (verified environment: Node 24). From a fresh source checkout:

```sh
npm ci
npm run build
npm run db:migrate
npm run preview
```

Open **http://localhost:8787**. This preview includes the real API and disk-backed local D1 database. No cloud credentials or paid plan are needed locally. Restarting with the same project directory preserves proposals in `.wrangler/state`. Do not delete that directory if you need those local records.

`npm run dev` is for Next.js UI work only; use the full build/preview for publication and confirmation. Rebuild after source changes. `.env.example` documents configuration; no application secret or browser database key is required. Local and production databases are separate.

## Architecture and guarantees

- Next.js + TypeScript renders the three routes: `/`, `/offer/?token=…`, `/status/?token=…`. Next.js static assets are served by a Cloudflare Worker; the API and SQL storage are server-side.
- `src/lib/calculation.ts` is shared by demo, editor, and publication. Integer cents, integer minutes and cents/hour are validated. `BigInt` protects intermediate multiplication and exact threshold comparisons. Required prices round upward to a cent. Displayed rates alone are rounded.
- The server rejects supplied totals and other unexpected fields. Every publication recalculates and inserts a new JSON snapshot; the API has no operation to edit a snapshot.
- Swaps enumerate at most 4,096 combinations, minimize removed count, then removed minutes, then numerical lexicographic original indices. This does not rank client value. All required work and the complete new request remain.
- Two independent 256-bit cryptographic capabilities authorize public and owner access. Only hashes are used for lookups. The owner token is never stored in plaintext or returned by client routes. The client token is retained only to reconstruct the client link for the owner.
- Public response objects explicitly allowlist names, prices, options and confirmation. Hours, expenses, minimum rate, diagnostics, input snapshot and owner link are absent. The public static page contains no proposal data. Responses disable caching and referrers; there are no third-party scripts or analytics.
- Confirmation is a single SQL compare-and-set update against the saved option IDs. The first choice wins. Same-choice retries return the saved timestamp; another choice returns HTTP 409. D1 is persistent storage, not process memory.

Supported inputs: 1–12 original items; names 1–160 characters with no control characters; money 0–1,000,000,000 cents ($10 million) per field; minimum rate 0–100,000,000 cents/hour; time 0–1,000,000 minutes per item. Original and offered total time must be positive. Zero-time individual items are permitted. The calculator never silently repairs invalid values.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run test:api
```

The API suite requires `npm run preview` in another terminal. `BASE_URL` can target a real deployment; tests create synthetic proposals. PowerShell example:

```powershell
$env:BASE_URL = 'https://your-production-host.example'
npm run test:api
```

For restart persistence, run with `PERSISTENCE_PHASE=write`, stop and restart preview, then rerun with `PERSISTENCE_PHASE=read`. The ignored `test-results/persistence-receipt.json` retains only synthetic test links. Do not commit it. For POSIX shells prefix the command with `PERSISTENCE_PHASE=write`; for PowerShell set `$env:PERSISTENCE_PHASE = 'write'`.

See `VERIFICATION.md` for executed checks and remaining limits. Unit expectations use fixed known results, independent of the calculator under test.

## Deploy

**Sites:** `.openai/hosting.json` binds the existing Site identity and the logical D1 database `DB`. `npm run build` produces a Worker at `dist/server/index.js`, Next.js assets at `dist/client`, and migration metadata at `dist/.openai`. Publish the exact pushed commit and its build archive using Sites. Sites provisions D1 and applies `drizzle/0000_proposals.sql` before deployment. Do not publish only the Next.js `out/` directory: it lacks the API and persistent storage.

**Direct Cloudflare alternative:** sign in with `npx wrangler login`, create a database with `npx wrangler d1 create keepyourrate`, and replace the placeholder `database_id` in `wrangler.jsonc` with its returned ID. Then:

```sh
npm run build
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Use an existing suitable free account; no paid subscription is required or purchased by this project. Confirm available quotas before broader use. Set the public site audience so client links work without login. Do not embed credentials or proposals in source, build assets, or logs. Keep request access logging disabled because URLs are bearer capabilities.

The public GitHub repository is linked above. The `.gitignore` excludes dependencies, build outputs, local D1, environment files and test receipts. Review `git ls-files` before pushing changes. Sites also has its own separate source repository; synchronize the exact source used for each deployment.

## 60-second judging scenario

1. **0–10 s:** Try the demo. Show $60/hour current rate, $40/hour if added free (−33.3%), and +$300 to keep everything.
2. **10–25 s:** Show the $1,000 package and $700 swap. Make one replaceable item required: swap disappears. Restore it and add $30 video expenses: $1,030 total, $330 extra, and a private $30 budget shortfall. Reset the demo.
3. **25–40 s:** Publish, copy the message, and retain the separate private status link.
4. **40–50 s:** Open the client link in an independent browser. Confirm the $700 swap after reviewing unchanged, added and removed work.
5. **50–60 s:** Reload the owner status link. Show the agreed scope, price, selected option and server timestamp.

## Prepared usefulness study — not conducted

Recruit 3–5 people who personally negotiate fixed-price service projects. Observe without coaching:

1. Recall a real additional client request.
2. Enter the original project and request without hints.
3. Prepare a proposal and copy the message.
4. Explain in their own words what the client receives in each option.
5. Say whether they would send this message and what prevents it.

Record completion, points of difficulty, and participant comments. No participants have been contacted and no feedback, willingness to pay, revenue effect or validated demand is claimed. No research UI or analytics is included.

## Boundaries

Links grant access to anyone holding them; save the owner link privately. There is no login, identity verification, link recovery/revocation, deletion UI, or payment flow. Confirmation records agreement on scope and price; an agreed extra charge is not collected revenue. Published snapshots cannot be edited; create a new proposal instead. Drafts stay in the browser and do not sync between devices; published proposals remain in D1. This MVP has no application-level abuse throttling; a larger public launch should configure hosting rate limits and retention. No official competition weights were provided or invented.
