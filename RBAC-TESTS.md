# Onix Finance — Role-Based Access Control Test Plan

This document is the **manual test plan** for RBAC across the Onix admin portal
and Railway (`server.js`) proxy. It covers all three roles, both frontend
gating and backend enforcement, and every action listed in the permission
matrix.

## 0. Roles & permission matrix

Two fields on `profiles` combine to produce a role:

| DB field         | Values                          |
| ---------------- | ------------------------------- |
| `role`           | `admin` \| `client`             |
| `title`          | `admin` \| `manager` \| `ae`    |

The **effective title** used everywhere is derived from `profiles.title`, and
falls back to `admin` if the row's `role='admin'` but `title` is null (legacy).

The single source of truth is `permissions.js` (frontend) and `RBAC_MATRIX` in
`server.js` (backend). They MUST agree.

| Permission key | Admin | Manager | AE  | What it gates                                                                    |
| -------------- | :---: | :-----: | :-: | -------------------------------------------------------------------------------- |
| `manageUsers`  |  ✅   |   ❌    | ❌  | Manage Users / User Roles view, "Add Admin" button, role changes                 |
| `addClients`   |  ✅   |   ❌    | ❌  | "+ New Client" button on Clients tab                                             |
| `removeClients`|  ✅   |   ❌    | ❌  | "Remove" / "Reject" / bulk-reject on Clients & Pending Approvals                  |
| `viewProjects` |  ✅   |   ✅    | ✅  | Sidebar access to Loans / Investments / Raises / Applications / OUS Pasiva       |
| `editContent`  |  ✅   |   ❌    | ❌  | Add/Edit Loan+Investment+Raise, Add Payment/Distribution, Document upload        |
| `billing`      |  ✅   |   ✅    | ✅  | OUS Pasiva "Cierre Saldos" and "Por Vencer" report fetches (view-only)           |

**Manager & AE are read-only observers.** They see everything Admin sees on
Dashboard / Clients / Loans / Investments / Raises / Applications / Reports /
OUS Pasiva, but no mutation UI is visible and the DB rejects any bypass
attempt (RESTRICTIVE "non-admin cannot ..." policies require
`current_admin_title() = 'admin'` for INSERT / UPDATE / DELETE on all
portfolio and document tables). AE is additionally scoped to
`assigned_to = auth.uid()` rows via the "ae scope ..." SELECT policies.

DB layer additionally enforces AE data scoping via RLS: an AE only **sees**
profiles / loans / investments / loan_payments / distributions where
`assigned_to = auth.uid()` (via parent for children rows).

---

## 1. Test users

Create three test users in Supabase before running these tests. Assign them
distinct emails you can log into.

| Test user email                | `role`  | `title`  |
| ------------------------------ | ------- | -------- |
| `rbac-admin@onixfinance.com`   | admin   | admin    |
| `rbac-manager@onixfinance.com` | admin   | manager  |
| `rbac-ae@onixfinance.com`      | admin   | ae       |
| `rbac-client@onixfinance.com`  | client  | (n/a)    |

Also seed:

- **Loan A** with `assigned_to = rbac-ae`'s id
- **Loan B** with `assigned_to = rbac-admin`'s id (NOT the AE)
- **Investment A** with `assigned_to = rbac-ae`'s id
- **Investment B** with `assigned_to` unset
- **Client C** with `assigned_to = rbac-ae`'s id
- **Client D** with `assigned_to = rbac-admin`'s id

---

## 2. Admin — smoke checklist

Log in as `rbac-admin@…`. Expected: **everything works, nothing hidden.**

- [ ] All sidebar views reachable: Dashboard, Clients, Loans, Investments, Raises, Applications, OUS Pasiva, Users, Documents, Reports, Calendar
- [ ] Clients tab: "+ New Client" button visible & functional; Assigned-to dropdown populated with staff
- [ ] Clients tab: "Remove" and Pending "Reject" / bulk-reject visible & functional
- [ ] Loans tab: "+ Add Loan" button visible, Add Loan modal saves with `assigned_to`
- [ ] Loans tab: row → "Edit" saves; assigned_to editable
- [ ] Loans tab: row → "Add Payment" works
- [ ] Investments tab: Add / Edit both work; Investment card shows "Add Distribution"
- [ ] Users view: full CRUD on staff & clients, "Manage Users" heading visible
- [ ] OUS Pasiva → "Fetch Cierre Saldos" and "Fetch Por Vencer" both return data (200)
- [ ] No red Access Denied modal appears anywhere

---

## 3. Manager — smoke checklist

Log in as `rbac-manager@…`. Expected: **read-only observer.** Same view
as Admin (all data on Dashboard, Clients, Loans, Investments, Raises,
Applications, Reports, OUS Pasiva), no mutation UI, no user management.

### Should WORK (view only)
- [ ] Sidebar shows Dashboard, Clients, Loans, Investments, Raises, Applications, OUS Pasiva, Documents, Reports, Calendar
- [ ] Dashboard KPIs render with the same numbers as Admin sees
- [ ] All Client rows visible (not scoped)
- [ ] All Loan / Investment / Raise / Application rows visible
- [ ] Clicking a loan/investment opens the detail modal — data loads
- [ ] OUS Pasiva "Fetch Cierre Saldos" and "Fetch Por Vencer" both return data (view-only)

### Should be BLOCKED
- [ ] Manage Users / User Roles view NOT reachable from sidebar; direct nav shows Access Denied
- [ ] "Add Admin" / role-changer dropdown on Team & Settings HIDDEN
- [ ] "+ New Client" button HIDDEN
- [ ] "+ Add Loan" / "+ Add Investment" / "+ Add Raise" buttons HIDDEN
- [ ] Loan / Investment / Raise row "Edit" buttons HIDDEN
- [ ] "Add Payment" / "Add Distribution" buttons HIDDEN on detail modals
- [ ] Document upload form HIDDEN on all detail modals
- [ ] Client rows: "Remove" button HIDDEN
- [ ] Pending Approvals: "Reject" / "Bulk Reject" HIDDEN
- [ ] Devtools bypass: `OnixDB.client.from('loans').update({...}).eq('id', '<any>')` returns Postgres error (`non-admin cannot edit loans`)
- [ ] Devtools bypass: `.from('loans').insert({...})` returns Postgres error
- [ ] Devtools bypass: `.from('profiles').update({role:'admin'}).eq('id', '<other user>')` returns Postgres error (William's trigger blocks non-admins)

---

## 4. AE — smoke checklist

Log in as `rbac-ae@…`. Expected: read-only view of **their own** book.

### Should WORK
- [ ] Sidebar shows Dashboard, Clients, Loans, Investments, Raises, Applications, OUS Pasiva (view only), Documents, Calendar
- [ ] Clients tab shows only Client C (assigned to this AE) — Client D is invisible
- [ ] Loans tab shows only Loan A — Loan B is invisible
- [ ] Investments tab shows only Investment A — Investment B is invisible

### Should be BLOCKED (frontend + backend)
- [ ] Manage Users / User Roles view NOT reachable
- [ ] "+ New Client" button HIDDEN
- [ ] "Remove" / "Reject" client buttons HIDDEN
- [ ] "+ Add Loan" / "+ Add Investment" / "+ Add Raise" HIDDEN
- [ ] Loan / Investment / Raise row "Edit" buttons HIDDEN
- [ ] "Add Payment" / "Add Distribution" HIDDEN on detail modals
- [ ] Document upload form HIDDEN on all detail modals

### Data-scoping tampering
- [ ] In devtools, run `OnixDB.client.from('loans').select('*').eq('id', '<Loan B id>')` — result is empty (RLS "ae scope loans" filters)
- [ ] Run `.from('profiles').update({ status: 'active' }).eq('id', '<any client>')` — Postgres error (`onix_enforce_admin_permissions` blocks non-admin admin work)
- [ ] Run `.from('loans').insert({...})` — RESTRICTIVE policy "non-admin cannot insert loans" blocks
- [ ] OUS Pasiva "Fetch Cierre Saldos" and "Fetch Por Vencer" **return data** (view-only, allowed)

---

## 5. Client (`role='client'`) — smoke checklist

Not a staff role, but confirming isolation.

- [ ] Cannot even reach `admin-portal.html` — RLS on `profiles` returns nothing when this user hits admin queries
- [ ] Sees only their own profile / loans / investments in the client portal
- [ ] Cannot escalate role via client-portal profile edit (RLS trigger)

---

## 6. Backend proxy (`server.js`) — direct-hit tests

Use `curl` with a valid Supabase JWT for each test user.

```bash
TOKEN=<paste JWT for rbac-ae@…>
BASE=https://onix-server.example.com  # Railway URL

# Should be 200 for all roles
curl -H "Authorization: Bearer $TOKEN" $BASE/api/catalogos

# Should be 200 for all three staff titles (billing is view-only)
curl -H "Authorization: Bearer $TOKEN" $BASE/api/creditos-cierre-saldos
curl -H "Authorization: Bearer $TOKEN" $BASE/api/creditos/por-vencer
```

- [ ] Admin token: all 200
- [ ] Manager token: catalogos 200, cierre-saldos 200, por-vencer 200
- [ ] AE token: catalogos 200, cierre-saldos 200, por-vencer 200
- [ ] Tampered token (wrong signature) → 401 (`requireOnixAdmin` rejects)
- [ ] Client-role token → 403 from `requireOnixAdmin`

(Note: `editContent` is enforced at the DB layer via RESTRICTIVE
"non-admin cannot ..." policies, not via the proxy. If we ever add
edit-content proxy routes, gate them with `requirePerm('editContent')`.)

---

## 7. Frontend gating — visual checks

For each role, take a screenshot of:
- [ ] Sidebar (which items are visible)
- [ ] Clients tab (are Add / Remove buttons present?)
- [ ] Loan detail modal (are Edit / Add Payment / doc upload present?)
- [ ] OUS Pasiva tab after clicking Fetch (data, or Access Denied modal?)

Access Denied modal must be:
- [ ] Branded (red `#C0392B` top border, Cormorant Garamond italic title)
- [ ] Bilingual (data-en/data-es swap when language toggled)
- [ ] Non-blocking to the rest of the page (dismissable, doesn't crash)

---

## 8. Session tamper resistance

- [ ] In devtools, edit `localStorage['onix-user']` to change `title` from `ae` to `admin`; refresh
- [ ] Confirm admin-only UI now shows on the client, BUT:
  - [ ] Any server call still gets 403 (backend re-fetches title from DB per request via `requireOnixAdmin`)
  - [ ] Any Supabase call still gets RLS-scoped or trigger-rejected results (DB is source of truth)
- [ ] Log out / log in — cached UI resets; title is re-fetched from `profiles`

---

## 9. Regression — data scoping does not break Admin/Manager

- [ ] Admin sees all clients / loans / investments (assigned_to filter does not apply)
- [ ] Manager sees all clients / loans / investments (assigned_to filter does not apply)
- [ ] Only AE (via `public.is_ae()` helper in RESTRICTIVE policies) is scoped

---

## 10. Sign-off

Run all sections for a release. Attach screenshots or a signed checklist to
the PR.

| Section              | Tester | Date       | Pass/Fail |
| -------------------- | ------ | ---------- | --------- |
| 2. Admin             |        |            |           |
| 3. Manager           |        |            |           |
| 4. AE                |        |            |           |
| 5. Client            |        |            |           |
| 6. Backend proxy     |        |            |           |
| 7. Frontend visual   |        |            |           |
| 8. Session tamper    |        |            |           |
| 9. Regression        |        |            |           |
