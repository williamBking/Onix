# Onix Finance — Agent Notes

## Editing admin-portal.html

This file's real content is **not** the visible HTML — it's a JSON-encoded
string inside a single `<script type="__bundler/template">` tag near the
end of the file (a "bundler" export format). Everything before that tag is
a loading shell that decodes and mounts this blob at runtime.

**Never edit this file with git merge, cherry-pick, rebase, or any other
line-based tool.** The entire template lives on one line; a line-based
merge cannot meaningfully resolve conflicts in it, and has silently
corrupted the file more than once — including cases where corruption only
appeared *after* GitHub's actual merge, even though the branch-level diff
looked clean. Branch-level verification alone is not sufficient.

**Only ever edit it via decode → edit → re-encode:**

0. Back up first: `cp admin-portal.html admin-portal.html.bak-<timestamp>`.
1. Extract the JSON string from the `__bundler/template` script tag.
2. `JSON.parse()` it to get the real HTML/JS content.
3. Make the edit as a plain string replacement using a **function**
   replacer — `str.replace(old, () => newStr)` — never a string replacer.
   The content is full of `$`-prefixed currency-formatting code, and
   `String.replace()` treats `$&`, `$'`, `` $` `` etc. specially in a
   *string* replacement argument, silently splicing in huge unrelated
   chunks of the file. A function replacer inserts its return value
   verbatim with no special-pattern interpretation.
4. Re-encode with `JSON.stringify()`, **then escape nested `</script>` as
   `<\/script>`** before writing it back:
   ```js
   function safeStringifyForScriptTag(str) {
     return JSON.stringify(str).replace(/<\/script/gi, '<\\/script');
   }
   ```
   The decoded content has its own nested `<script>` tags (Chart.js CDN,
   i18n, the dashboard init script). `JSON.stringify()` does not escape
   forward slashes, so skipping this step leaves those nested closing
   tags as literal `</script>` — which a real browser's HTML parser
   treats as closing the *outer* `__bundler/template` tag at the first
   occurrence, silently truncating the blob to a few KB. This shipped
   broken once already. Local `JSON.parse()` on the raw line does **not**
   catch this, because it doesn't simulate a browser's HTML tag-boundary
   parsing — you have to check *how many `</script>` occur between the
   opening tag and where you claim the closing tag is*, or run a real
   `DOMParser` extraction.
5. Verify before trusting the edit:
   - Occurrence-count each anchor string in the decoded content before
     replacing (abort if it's not exactly 1).
   - `node --check` on every inline `<script>` block in the decoded
     content.
   - Confirm exactly one raw `</script>` exists between the opening
     `__bundler/template` tag and its true close, in the **final
     re-encoded file** (not just the decoded string).
   - Ideally, load the raw file text into a real browser's `DOMParser`
     and confirm the extracted `textContent` round-trips through
     `JSON.parse()` to the expected length — this is the only check that
     actually simulates what a real page load does.
6. After pushing, verify **live on the deployed site** (hard-refresh,
   check browser console) before considering the task done — local and
   even CI verification have both missed real breakage before.

**Keep changes to this file small and separate.** Do not bundle multiple
unrelated changes (e.g. a bug fix + a new feature) into one edit pass —
verify and ship one change at a time. A bundled chart-fix + feature change
was merged and reverted within the same session with no recorded
explanation; treat that as the reason this rule exists.

CI enforces the JSON-validity and `node --check` parts of step 5
automatically via `.github/workflows/validate-admin-bundle.yml` (required
status check `validate-admin-bundle`, runs on the PR merge result) — but
don't rely on CI to catch what local verification should already catch.

## Project Status & History (as of late July 2026)

Comprehensive handoff summary for a fresh session with no prior context.
Every fact below was independently re-verified against the live codebase
and Supabase project (not transcribed blindly) as of this writing.

**Before touching `admin-portal.html`, read "Editing admin-portal.html"
above first** — it's current and unchanged; nothing below duplicates it.

### Project overview

Onix Finance is a bilingual (EN/ES) client-facing financial portal for a
Houston-based private lender, serving both clients (loan/investment
management) and admins. Live at williambking.github.io/Onix. Supabase
project: `ckayfqplkpplgojdhjlu`.

### What's live and working

- **Client portal**: loan/investment viewing, document access, bilingual
  UI, and self-service profile editing (name/phone/address/date of
  birth) — confirmed genuinely wired to `profiles.update(...).eq('id',
  userId)` in `client-portal-data.js` (`wireProfileForm`), not cosmetic.
- **Admin portal**: full dashboard, client/loan/investment/raise
  management, calendar, document manager (`client_documents` table +
  `client-documents` Storage bucket), an admin self-service profile
  modal (`__onix_profile` in `admin-portal.html`), and admin-only client
  notes (`client_admin_notes` table — confirmed to exist with
  `profile_id`/`notes`/`updated_at`/`updated_by`).
- **Document migration**: confirmed via direct query — **1,171
  documents across 88 distinct clients** in `client_documents`. Roughly
  62 Drive folders still need manual client-matching; there's a
  documented process for this (folder-to-client fuzzy matching,
  cross-referencing against loan balances, manual verification, batch
  migration via a one-time script in `onix-folder-migration/`, which
  lives *outside* this git repo as a sibling directory — ask the user
  for details if this comes up again).

### Critical security fixes applied — all confirmed still in place

- **RLS permissive-OR bug, fixed.** Checked `pg_policies` on `profiles`,
  `loans`, `investments`, `loan_payments`, `distributions` directly: no
  "ae scope" policies remain on any of them. Only clean, correctly-
  scoped policies exist now (`X_admin_all` via `is_admin()`,
  `X_select_own` via ownership check, plus RESTRICTIVE non-admin-cannot-
  write policies via `is_staff_admin()`).
- **`ous_sync_log` / `ous_latest_capture`, locked down.** `ous_sync_log`
  has RLS enabled with a single admin-only SELECT policy.
  `ous_latest_capture` (a view) has `security_invoker=true` set —
  confirmed directly via `pg_class.reloptions` — so it no longer
  bypasses RLS on the underlying `ous_raw_capture` table (which itself
  also has RLS enabled + an admin-only policy).
- **`ous_sync_trigger()` / `recalc_loan_state(uuid)`, execution
  restricted.** Checked `pg_proc.proacl` directly: both show EXECUTE
  granted only to `postgres` and `service_role` — no
  `authenticated`/`anon`/PUBLIC grant remains.
- **RLS performance work**: confirmed `auth.uid()` calls are
  consistently wrapped as `(select auth.uid())` across every policy
  checked (per-query, not per-row, evaluation). FK-shaped indexes exist
  on most foreign-key columns (`*_user_id_idx`, `*_uploaded_by_idx`,
  `*_related_*_idx`, etc.) — Supabase's own performance advisor
  currently reports these as "unused" (not missing, just not yet
  exercised by real traffic — expected for a low-traffic app). Note:
  the advisor still reports ~20 "multiple permissive policies" warnings
  today (e.g. `profiles` has both `profiles_select_admin` and
  `profiles_select_self` as separate PERMISSIVE SELECT policies) — this
  is the deliberate admin-all + self-own two-policy pattern used
  throughout the schema, not redundant/accidental duplication. Couldn't
  independently verify the historical "~40 removed" figure with no
  prior snapshot to diff against, but the current policy set looks
  intentional and clean.
- **`raises` / `raise_documents` now require login.** Confirmed: both
  `raises_select_authenticated` and `raise_documents_select_authenticated`
  are scoped to `roles={authenticated}`, not `{public}`/`{anon}` —
  anonymous access is gone.
- **Still pending**: "Leaked Password Protection" is confirmed still
  disabled (checked via Supabase's security advisor) — user has not yet
  been able to enable it from the dashboard.
- **Not a new concern, already investigated**: Supabase's advisor flags
  several `SECURITY DEFINER` functions as directly callable via
  PostgREST RPC by `anon`/`authenticated` (`admin_create_client`,
  `current_admin_title`, `enforce_onix_admin_permissions`, `is_admin`,
  `is_ae`, `is_staff_admin`, `handle_new_user`,
  `trg_loan_payments_recalc`). The helper/check functions are benign by
  design (they just tell the caller their own role, which grants
  nothing). `handle_new_user` and `trg_loan_payments_recalc` are
  confirmed scanner false positives: both have return type `trigger`
  (verified via `pg_proc.prorettype`), and Postgres physically refuses
  to execute a trigger-typed function outside of an actual table
  trigger firing, regardless of any GRANT — this isn't a permissions
  gap, it's a structural language restriction. No further action needed
  here; don't re-investigate this from scratch in a future session.

### CI/CD safety net

- GitHub ruleset **"protect main"**: confirmed fresh via API —
  `enforcement: active`, requires both `scan`
  (no-merge-conflict-markers) and `validate-admin-bundle`,
  `bypass_actors: []`. Direct pushes to main are blocked — everything
  goes through a feature branch + PR.
- `validate-admin-bundle.yml` specifically catches JSON-encoding
  corruption in `admin-portal.html` before merge (this file has been
  corrupted twice historically by git merge/cherry-pick — never use
  those on this file; see "Editing admin-portal.html" above).

### Known pending items / open threads

- **PRs #106 (`ous-portal-integration`) and #107
  (`rbac-comprehensive`)** — confirmed still open, both `mergeable:
  CONFLICTING` with main. Neither has moved recently, and enough has
  landed on main since (deposits/loans split, financial reports rework,
  several chart fixes) that a fresh rebuild is likely more practical
  than resolving conflicts. User still needs to decide: revive, rebuild
  fresh, or close each.
- **Railway backend** (Express proxy to OUS Pasiva, `server.js`):
  fundamentals confirmed solid (real Supabase-JWT auth on every
  `/api/*` route including `/api/ous-capture`, no leaked secrets,
  proper CORS allowlist, graceful degradation when OUS is down). Three
  items still unverified/unaddressed: (1) confirm actual Railway env
  vars match what `server.js` expects — no Railway CLI/API access
  available in-session to check this directly, (2) check whether
  Railway redeploys on every GitHub push instead of only backend-file
  changes — health-snapshot data (`railway_status_snapshots` in
  Supabase) shows the process restarts more often than a stable service
  typically would, consistent with this hypothesis, (3) no rate
  limiting on OUS API calls yet.
- **`view-review`** in `admin-portal.html`'s decoded template —
  confirmed still present and still dead/unreachable (same category as
  two already-cleaned-up instances: the old Documents tab and the Edit
  Raise modal). Not yet removed.
- **`profiles.admin_notes`** column — confirmed it still exists in the
  schema, now superseded by the dedicated `client_admin_notes` table
  (which has its own admin-only RLS and audit columns). The old column
  is vestigial with zero UI referencing it; worth confirming/dropping
  later.

### Upcoming work

User is about to start integrating a new third-party API (separate and
different from the already-integrated OUS Pasiva API). Standard
workflow for this project: test the new API's endpoints in Postman
first, get credentials/docs from the user's boss, plan Supabase schema
(with RLS from day one, not bolted on after) before writing sync code,
likely extend or mirror the existing Railway Express.js proxy pattern
used for OUS Pasiva.

## Session Handoff Notes

Narrower and more time-sensitive than the sections above — this is what
happened in the session that just ended, not yet folded into the durable
summary above. Once acted on, fold anything still relevant up into
"Project Status & History" and delete it from here; don't let this
section grow indefinitely.

### Shipped this session, not otherwise documented above

- **Chart.js recursion, root-caused and fixed (merged, PRs #135/#136).**
  Worth knowing for any future chart work: `admin-portal.html` vendors
  Chart.js **v4.4.0** itself — gzip+base64 inside the `__bundler/manifest`
  tag, reconstituted to a `blob:` URL at load, not fetched from a CDN at
  request time. The original "`Recursion detected: _scriptable->_scriptable`"
  error came from Chart.js's scriptable-options resolver, which has a
  deliberate, guarded recursion check (throws a clean error on purpose).
  After fixing that (canvas-reuse: destroy before recreate), a *different*
  error surfaced — `RangeError: Maximum call stack size exceeded at
  Object.set` — from a separate, unguarded `Proxy` `set` trap in Chart.js's
  option-scope-merger, hit specifically because `admin-portal-data.js`'s
  `updateDashboardCharts()`/`updateReportsCharts()` were **wholesale-
  replacing** `chart.data.labels` / `chart.data.datasets[0].data` /
  `chart.options.plugins` on every repaint tick instead of mutating them
  in place. Fixed by mutating instead (`array.length = 0; array.push(...)`
  for data, direct property assignment for options) — Chart.js's own
  documented pattern. **General rule going forward: never replace
  `chart.data`/`chart.options` sub-objects wholesale on an existing Chart
  instance; always mutate in place, then call `chart.update()`.**
- **Combined the ID and Passport document filters** into one "ID/Passport"
  option across all three places that grouped by category (admin's Client
  Documents modal, admin's "Missing document" dropdown, client portal's "My
  Documents" tab) — display-layer only, `client_documents.category` still
  stores `'id'`/`'passport'` as distinct real values; upload pickers
  correctly still offer them separately.
- **Fixed the admin calendar forcing horizontal scroll** on the whole page
  (missing `min-width:0` on `.cal-cell`/`.main`, a CSS Grid gotcha — grid
  items default to `min-width:auto` and can force a track wider than its
  container).
- **Four small fixes from a portal audit**, each its own PR: gated
  `paintDashboardView`'s debug `console.log` behind
  `localStorage.getItem('onix-debug')` instead of it running unconditionally
  every ~600ms forever; hardened the Financial Reports tab's detection
  (`isDocumentsView()`) to key off the stable `id="view-documents"` instead
  of matching the heading text, which had already broken silently once
  before when the heading was renamed — now logs a `console.warn` if the
  expected structure isn't found instead of failing silently; removed a
  dead, never-read `notesContainer` selector in the admin "Post Note"
  handler; removed the entire dead Edit Raise modal
  (`openRaiseEditor`/`saveRaise`/`closeRaiseEditor`/`closeRaise` + its
  modal HTML) — confirmed unreachable, `saveRaise()` had no real Supabase
  call at all, just a fake success alert.
- **Built the Admin Notes feature** (see "What's live and working" above
  for the `client_admin_notes` table) — UI lives in
  `openClientInLPModal()` in `admin-portal.html`, a new section right
  after Active Investments, with an explicit "Save Notes" button (no
  auto-save) and a "Last updated by [name] on [date]" line. That label
  is populated from the current admin's own `localStorage['onix-user']`
  snapshot (set once at login) rather than a second round-trip query —
  known, accepted tradeoff: it can show a stale name if that admin's own
  `full_name` changed elsewhere mid-session, but self-corrects the next
  time the modal is reopened for that client (fresh DB join), and the
  actual persisted `updated_by`/`updated_at` are never wrong.
- **Full repo hygiene pass**: deleted 99 confirmed-merged stale branches
  from the remote (kept `main`, `rbac-comprehensive`, `ous-portal-integration`
  only). Full git-history secrets scan came back clean (no leaked keys —
  only the public Supabase anon key, which is meant to be public).
  GitHub's own secret scanning is disabled on this repo — nobody has
  turned it on; worth doing since it's a free, automatic backstop for
  exactly what was manually checked once here.

### Working directory state right now

- Every branch created this session, including the one that added the
  "Project Status & History" section above (`fix-chart-recursion-v3`,
  `combine-id-passport-doc-filter`, `fix-calendar-horizontal-overflow`,
  `gate-dashboard-debug-log`, `harden-financial-reports-detection`,
  `remove-dead-notes-container-selector`, `remove-dead-edit-raise-modal`,
  `add-admin-notes-feature`, `update-claude-md-project-status`), is
  confirmed **merged into `main`** (verified via `git merge-base
  --is-ancestor` against `origin/main`, not assumed — re-checked fresh
  right before writing this). This "Session Handoff Notes" section
  itself is being added on a new branch, `add-session-handoff-notes`,
  off that same up-to-date `main`.
- One untracked leftover file: `admin-portal.html.bak-20260723-214625`
  (a backup made during the Edit Raise modal removal's decode/edit/
  re-encode process). Harmless, safe to delete, just never cleaned up —
  same as the five earlier `.bak` files that *were* cleaned up during
  the branch-hygiene pass.
- Local clone also has several stale local-only branch refs pointing at
  already-merged or long-abandoned work (their `[origin/...: gone]`
  marker means the remote side is already deleted) — cosmetic, `git
  fetch --prune` plus deleting the local refs would tidy this up
  whenever convenient, not urgent.

### Working-style expectations confirmed this session

Not written down elsewhere in this file, but consistently how the user
wants this project worked on:

- **One logical change = one branch = one commit.** Every fix this
  session, no matter how small (even a one-line debug-log gate that
  never touched `admin-portal.html`), got its own branch and its own PR
  rather than being batched with anything else.
- **Always show the diff and wait for explicit go-ahead before
  committing** — for every single change, not just `admin-portal.html`
  edits.
- **Proposing a better technical alternative to what was literally
  asked, clearly flagged and justified, is welcomed rather than
  overstepping** — confirmed repeatedly and explicitly (e.g. tracking
  chart-instance identity instead of a literal boolean reset; putting a
  CSS override in the already-existing injected stylesheet instead of
  editing the blob to add a new attribute; reusing the existing stable
  `id="view-documents"` instead of adding a new `data-view-id`
  attribute). The pattern that worked: implement the substitution,
  then explicitly call out *what* was changed from the literal request
  and *why*, and let the user confirm or override.

### Unresolved open questions

- **Railway access gap — never answered.** During the Railway health
  check, the user was asked: grant CLI/API access this session, or
  check the dashboard themselves and relay findings back? No answer was
  given before the conversation moved on. This is still open and blocks
  fully verifying the three Railway items already listed above under
  "Known pending items."
- **The new third-party API integration was never described.** The user
  said they'd share details once the CLAUDE.md comprehension check was
  confirmed, then asked for this handoff instead. A new session's first
  real task is almost certainly this — if the user doesn't immediately
  provide the API details, ask for them rather than waiting.

### Next action for a new session

Expect the user to describe the new third-party API next (or ask them
for it if they don't). Before writing any integration code: test its
endpoints in Postman, get credentials/docs from the user's boss, and
plan the Supabase schema with RLS from day one — per "Upcoming work"
above. Separately, whenever convenient: resolve the Railway-access
question above if it becomes relevant again.
