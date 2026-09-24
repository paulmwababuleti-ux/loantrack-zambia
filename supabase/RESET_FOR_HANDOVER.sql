-- =====================================================================
--  ⚠️  DANGER: PERMANENTLY DELETES EVERY CLIENT, LOAN AND PAYMENT  ⚠️
--
--  Run this ONLY when you are ready to hand the app over to the real
--  company, with all your test data cleared out. This CANNOT be undone -
--  there is no confirmation step inside the database itself, only this
--  comment. Use the app's own "Backup data" button first if you want a
--  copy of anything before running this.
--
--  What this does:
--    1. Deletes every payment, installment, loan, client and activity
--       log entry. Admin accounts (Super Admin, Master Admin, Loan
--       Officer) are NOT touched - your staff logins stay exactly as
--       they are.
--    2. Makes a client's email address REQUIRED going forward, now that
--       the table is empty. (Before this, it was only required by the
--       form, not the database, so your test clients without an email
--       wouldn't have blocked this from running earlier.)
--
--  After running this, the app is a genuinely blank slate: no clients,
--  no loans, no history - ready for the company's real data.
-- =====================================================================

delete from public.payments;
delete from public.installments;
delete from public.loans;
delete from public.clients;
delete from public.activity_logs;

alter table public.clients alter column email set not null;

-- Confirms everything is empty:
select
  (select count(*) from public.clients)  as clients_left,
  (select count(*) from public.loans)    as loans_left,
  (select count(*) from public.payments) as payments_left;
