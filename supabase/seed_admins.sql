-- =====================================================================
--  LOANTRACK - CREATE THE FIRST ADMIN ACCOUNTS
--
--  There are three roles:
--    super_admin   the developer/owner's own account. Can do everything,
--                  including creating and managing Master Admin accounts.
--                  Can ONLY be granted here, by SQL - never from the app.
--    master_admin  approves loans, records payments, manages Loan Officers.
--    loan_officer  adds clients, creates loans (which start Pending).
--
--  Once you have at least one super_admin or master_admin signed in,
--  every other account (Master Admin or Loan Officer) can be created
--  from inside the app itself: Settings, Add staff account. This script
--  is only needed for the very first account(s), or to promote someone
--  to super_admin (the app can never do that).
--
--  STEP 1  Dashboard -> Authentication -> Users -> Add user -> Create new user.
--          Do this once per person you're adding here. Tick "Auto Confirm User".
--  STEP 2  Change the emails and names below to match, then run this script.
--          Exactly one row should be 'super_admin' - that's you.
--  You can re-run it any time (for example to change a role).
-- =====================================================================

insert into public.admins (id, email, full_name, role)
select u.id, u.email, v.full_name, v.role
from (values
  ('you@example.com',      'Your Name',      'super_admin'),
  ('officer1@example.com', 'Loan Officer 1', 'loan_officer')
) as v(email, full_name, role)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (id) do update
  set full_name = excluded.full_name, role = excluded.role, is_active = true;

-- Check the result:
select email, full_name, role, is_active from public.admins order by role, email;
