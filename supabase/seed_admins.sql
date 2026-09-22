-- =====================================================================
--  LOANTRACK - CREATE THE 5 ADMIN ACCOUNTS
--
--  STEP 1  Dashboard -> Authentication -> Users -> Add user -> Create new user.
--          Do this 5 times (email + password each). Tick "Auto Confirm User".
--  STEP 2  Change the emails and names below to match, then Run this script.
--          Exactly one row should be 'master_admin'. The others are 'loan_officer'.
--  You can re-run it any time (for example to change a role).
-- =====================================================================

insert into public.admins (id, email, full_name, role)
select u.id, u.email, v.full_name, v.role
from (values
  ('master@example.com',   'Master Admin',   'master_admin'),
  ('officer1@example.com', 'Loan Officer 1', 'loan_officer'),
  ('officer2@example.com', 'Loan Officer 2', 'loan_officer'),
  ('officer3@example.com', 'Loan Officer 3', 'loan_officer'),
  ('officer4@example.com', 'Loan Officer 4', 'loan_officer')
) as v(email, full_name, role)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (id) do update
  set full_name = excluded.full_name, role = excluded.role, is_active = true;

-- Check the result: you should see 5 rows.
select email, full_name, role, is_active from public.admins order by role, email;
