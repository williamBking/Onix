-- ============================================================
-- Onix Finance — database-level backstop for the Role Permissions
-- chart on the Team & Settings page (admin / manager / ae).
--
-- The website's JavaScript already blocks restricted actions
-- (admin-portal.html / admin-portal-data.js). This file adds the
-- SAME rules directly in the database, so they hold even if
-- someone bypasses the website's JavaScript entirely (e.g. via
-- browser dev tools or a direct API call).
--
-- How to run this: Supabase Dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Safe to re-run any time (every
-- statement replaces its own prior version, nothing else is touched).
-- ============================================================

-- Looks up the acting (currently logged-in) user's title.
-- Returns NULL for clients, and for admins created before the
-- title column existed (treated as full admin everywhere else
-- in this app, so we keep that same rule here).
create or replace function public.current_admin_title()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select title from public.profiles where id = auth.uid() and role = 'admin';
$$;

-- ------------------------------------------------------------
-- 1. "Manage Users" + "Remove Clients" — admin only.
--    Enforced with a trigger on profiles because it depends on
--    WHICH column is changing (title) or WHICH kind of row
--    (team member vs. client) is being deactivated.
-- ------------------------------------------------------------
create or replace function public.enforce_onix_admin_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_title text := coalesce(public.current_admin_title(), 'admin');
begin
  -- Changing someone's title (Admin/Manager/Account Executive) = Manage Users.
  if NEW.title is distinct from OLD.title and actor_title <> 'admin' then
    raise exception 'Your role does not have permission to manage users.';
  end if;

  -- Removing a team member (role=admin, status -> rejected) = Manage Users.
  if OLD.role = 'admin' and OLD.status is distinct from NEW.status
     and NEW.status = 'rejected' and actor_title <> 'admin' then
    raise exception 'Your role does not have permission to manage users.';
  end if;

  -- Rejecting a client application (role=client, status -> rejected) = Remove Clients.
  if OLD.role = 'client' and OLD.status is distinct from NEW.status
     and NEW.status = 'rejected' and actor_title <> 'admin' then
    raise exception 'Your role does not have permission to remove clients.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists onix_enforce_admin_permissions on public.profiles;
create trigger onix_enforce_admin_permissions
before update on public.profiles
for each row
execute function public.enforce_onix_admin_permissions();

-- ------------------------------------------------------------
-- 2. "Edit Content" — denied to Account Executives only.
--    (Admin and Manager can create, edit, and delete content.)
--
--    RESTRICTIVE policies AND with existing access rules — they
--    can only narrow access, never grant new access.
--
--    loans / investments / raises: AE can SELECT (they need to
--    view deals) but cannot INSERT, UPDATE, or DELETE.
--
--    *_documents: AE is fully blocked (covered by for all).
-- ------------------------------------------------------------

-- loans
drop policy if exists "ae cannot insert loans" on public.loans;
create policy "ae cannot insert loans" on public.loans
as restrictive
for insert
with check (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot edit loans" on public.loans;
create policy "ae cannot edit loans" on public.loans
as restrictive
for update
using (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot delete loans" on public.loans;
create policy "ae cannot delete loans" on public.loans
as restrictive
for delete
using (public.current_admin_title() is distinct from 'ae');

-- investments
drop policy if exists "ae cannot insert investments" on public.investments;
create policy "ae cannot insert investments" on public.investments
as restrictive
for insert
with check (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot edit investments" on public.investments;
create policy "ae cannot edit investments" on public.investments
as restrictive
for update
using (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot delete investments" on public.investments;
create policy "ae cannot delete investments" on public.investments
as restrictive
for delete
using (public.current_admin_title() is distinct from 'ae');

-- raises
drop policy if exists "ae cannot insert raises" on public.raises;
create policy "ae cannot insert raises" on public.raises
as restrictive
for insert
with check (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot edit raises" on public.raises;
create policy "ae cannot edit raises" on public.raises
as restrictive
for update
using (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot delete raises" on public.raises;
create policy "ae cannot delete raises" on public.raises
as restrictive
for delete
using (public.current_admin_title() is distinct from 'ae');

-- documents: full block for AE (no read needed — they see docs via the loan/investment record)
drop policy if exists "ae cannot touch loan_documents" on public.loan_documents;
create policy "ae cannot touch loan_documents" on public.loan_documents
as restrictive
for all
using (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot touch investment_documents" on public.investment_documents;
create policy "ae cannot touch investment_documents" on public.investment_documents
as restrictive
for all
using (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot touch raise_documents" on public.raise_documents;
create policy "ae cannot touch raise_documents" on public.raise_documents
as restrictive
for all
using (public.current_admin_title() is distinct from 'ae');

-- ------------------------------------------------------------
-- 3. "Billing" — denied to Account Executives only.
--    (Admin and Manager can manage payments and distributions.)
--
--    AE can still SELECT these tables to view client history,
--    but cannot create, modify, or delete payment/payout records.
-- ------------------------------------------------------------

-- loan_payments
drop policy if exists "ae cannot insert loan_payments" on public.loan_payments;
create policy "ae cannot insert loan_payments" on public.loan_payments
as restrictive
for insert
with check (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot update loan_payments" on public.loan_payments;
create policy "ae cannot update loan_payments" on public.loan_payments
as restrictive
for update
using (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot delete loan_payments" on public.loan_payments;
create policy "ae cannot delete loan_payments" on public.loan_payments
as restrictive
for delete
using (public.current_admin_title() is distinct from 'ae');

-- distributions
drop policy if exists "ae cannot insert distributions" on public.distributions;
create policy "ae cannot insert distributions" on public.distributions
as restrictive
for insert
with check (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot update distributions" on public.distributions;
create policy "ae cannot update distributions" on public.distributions
as restrictive
for update
using (public.current_admin_title() is distinct from 'ae');

drop policy if exists "ae cannot delete distributions" on public.distributions;
create policy "ae cannot delete distributions" on public.distributions
as restrictive
for delete
using (public.current_admin_title() is distinct from 'ae');

-- Note: "Add Clients" and "View Projects" (Raises) are allowed for every
-- role per the matrix, so no restriction is added for those.
-- "Manage Users" and "Remove Clients" (admin-only) are enforced via the
-- trigger above, not RLS policies, because they depend on which column
-- is changing rather than which table is being accessed.
