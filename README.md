# Onix Finance — Client Portal

Private lending and investment platform for Onix Finance clients. A secure,
branded web app where clients view their loans, investments, and documents;
admins manage every record.

**Live site:** https://williambking.github.io/Onix/login.html

---

## 1. Architecture

| Layer | Tool | Notes |
|---|---|---|
| Frontend | Vanilla HTML / CSS / JS | Static, served by GitHub Pages |
| Auth + DB | [Supabase](https://supabase.com) | Project `ckayfqplkpplgojdhjlu` |
| Email | [Resend](https://resend.com) via Supabase Edge Functions | Sandbox uses `onboarding@resend.dev` |
| File storage | Supabase Storage (private bucket `client-documents`) | Signed URLs only |
| Hosting | GitHub Pages — auto-deploys from `main` | ~30 s build time per commit |
| Repo | `williamBking/Onix` | Direct commits to `main` (see "Workflow" below) |

---

## 2. Pages

| File | Purpose | Auth |
|---|---|---|
| `login.html` | Sign-in page | Public |
| `signup.html` | Self-service registration | Public |
| `reset-password.html` | Password recovery landing | Public (requires Supabase recovery token) |
| `client-portal.html` | Client-facing dashboard | Requires `role='client'` + `status='active'` |
| `admin-portal.html` | Admin console | Requires `role='admin'` |
| `supabase.js` | Shared Supabase client + `OnixDB.*` helpers | Loaded by every page |
| `client-portal-data.js` | Live data layer for the client portal | Loaded by `client-portal.html` |
| `admin-portal-data.js` | Live data layer + Live Admin Console | Loaded by `admin-portal.html` |
| `i18n.js` | EN/ES toggle | Loaded by every page |

Cache-busting: every page references its JS deps with `?v=NN`. Bump that number
whenever you change the JS so users get the new code without a hard refresh.

---

## 3. Database schema

All tables live in the `public` schema. RLS is enabled on every table; clients
see only their own rows, admins see everything.

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users`. Holds `full_name`, `phone`, `address`, `role` (`client`/`admin`), `status` (`pending`/`active`/`rejected`) |
| `loans` | Active and historical loans, linked to clients via `user_id` and optionally to a `loan_applications.id` via `application_id` |
| `loan_documents` | Dropbox-link documents attached to a loan |
| `loan_applications` | Submitted from the client portal — admin reviews and approves |
| `loan_payments` | Scheduled and recorded loan payments |
| `investments` | Client positions in a venture (deposit or equity) |
| `investment_documents` | Documents per investment |
| `distributions` | Payouts/interest distributed to investors |
| `raises` | Open investment opportunities |
| `raise_documents` | Documents per raise |
| `raise_interests` | Captured client interest in a raise |
| `client_documents` | Supporting files uploaded with a loan application (links to a Storage object) |

**`is_admin()`** is a stable Postgres function that reads
`auth.jwt() -> 'app_metadata' ->> 'role'`. New admins must have
`raw_app_meta_data.role = 'admin'` for RLS-elevated policies to grant access.

---

## 4. Edge Functions

Three deployed:

| Function | Triggered by | Purpose |
|---|---|---|
| `send-loan-app-email` | `client-portal-data.js` after loan application insert | Emails Onix staff |
| `send-new-client-email` | `signup.html` after successful signUp | Emails Onix staff about pending approval |
| `send-account-activated-email` | `admin-portal-data.js` after admin approves a client | Emails the client that they can sign in |

**Required Supabase Edge Function secrets:**

- `RESEND_API_KEY` — get one at https://resend.com → API Keys
- `LOAN_APP_NOTIFY_EMAIL` (optional) — recipient for application emails. Defaults to `lukehubbard31@gmail.com`
- `LOAN_APP_FROM_EMAIL` (optional) — sender. Defaults to `Onix Portal <onboarding@resend.dev>`
- `NEW_CLIENT_NOTIFY_EMAIL` (optional) — falls back to `LOAN_APP_NOTIFY_EMAIL`

To verify your own domain so emails come from `@onixfinance.com`, see
https://resend.com/domains.

---

## 5. Local development

There is no build step. Open any HTML file in a browser or serve them with a
tiny static server:

```bash
cd path/to/repo
python3 -m http.server 8000
# then open http://localhost:8000/login.html
```

Edits to JS / HTML take effect on hard refresh.

---

## 6. Workflow

The team has been committing directly to `main`. This caused a merge conflict
to land in production (markers visible in the served HTML) which broke the
admin portal for half a day. To avoid that:

1. **Always `git pull` before editing.**
2. **Resolve merge conflicts before committing.** If you see
   `<<<<<<<` / `=======` / `>>>>>>>` markers in any file, do not commit until
   they're removed.
3. **Bump the `?v=NN` cache query** on any script you change so users see the
   new code without a hard refresh.
4. Long-term: enable Branch Protection on `main` in repo Settings →
   Branches, requiring at least one PR review before merge.

---

## 7. Test accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@onixfinance.com` | `admin123` |
| Admin | `admin2@onixfinance.com` | `admin#2` |
| Client (Carlos Mendoza) | `client3@onixfinance.com` | `client#3` |

Anyone else who has signed up via `/signup.html` lands in the **Pending
Approvals** queue — admin approves them from the Live Admin Console.

---

## 8. Common tasks

**Add a new admin** — sign in as admin → Clients tab → **+ New Client** → set
Role = Admin → Save. The new admin can sign in immediately.

**Reset a client's password** — they click "Forgot password?" on the login
page; Supabase emails them a recovery link.

**Add a loan to a client** — Admin → Loans tab → **+ Add Loan** → pick client
from dropdown → fill in loan details → Save. Carlos sees it on his portal next
login.

**Approve a pending registration** — Admin → Live Admin Console (red button
bottom-right) → **Pending Approvals** tab → click Approve. The client receives
an "Account is active" email automatically.

**Mark a loan application approved** — Admin → Loan Applications tab → click
**View** on the row → click **Approve**. A new loan is auto-created and
linked to the application.

---

## 9. Custom domain — `portal.onixfinance.com`

The site currently serves at `williambking.github.io/Onix`. The PRD calls for a
subdomain on `onixfinance.com`. To switch:

**Step 1 — Tell GitHub Pages the domain you want**

1. Go to https://github.com/williamBking/Onix/settings/pages
2. Under **Custom domain**, enter `portal.onixfinance.com` and click **Save**
3. GitHub will write a `CNAME` file to the repo root automatically

**Step 2 — Point DNS at GitHub**

In the DNS provider for `onixfinance.com` (GoDaddy / Cloudflare / wherever the
domain is managed), add a **CNAME record**:

| Type  | Host / Name | Value (Points to)              | TTL  |
|-------|-------------|--------------------------------|------|
| CNAME | `portal`    | `williambking.github.io`       | Auto |

Save. Propagation takes a few minutes to an hour.

**Step 3 — Enable HTTPS**

Once DNS resolves, go back to https://github.com/williamBking/Onix/settings/pages
and tick **Enforce HTTPS**. (May take 15-30 minutes for GitHub to provision the
TLS cert.)

**Step 4 — Update Supabase Auth redirect URLs**

Add `https://portal.onixfinance.com/reset-password.html` and
`https://portal.onixfinance.com/login.html` to the allowed redirect URLs in
Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
Otherwise password-reset emails will refuse to redirect to the new domain.

After all four steps, https://portal.onixfinance.com/login.html will be the
live site.

---

## 10. Known gaps (post-handoff)

See `Onix Finance Portal — 20 Suggested Upgrades` in the team Google Drive for
the prioritized backlog. Top items:

- Custom domain `portal.onixfinance.com` (PRD requirement; needs DNS pointed at GitHub Pages)
- Bulk-approve UI on the admin's Clients tab
- CSV export from the admin tables (compliance)
- Audit log on every record's View modal
- Wire the decorative notification bells on both portals
- Mobile-screen layout pass

---

## 11. Credits

Built by the Onix Finance intern team — frontend, backend, and integration —
with assistance from Claude Code. Designed by Claude Design for visual fidelity
with onixfinance.com.

*Private & Confidential — Onix Finance, LLC*
