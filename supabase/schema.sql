-- =====================================================================
--  LOANTRACK - PHASE 1 DATABASE
--  Run ONCE: Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
--  Then run supabase/seed_admins.sql to create your admin accounts.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- Staff. id is the same as the Supabase Auth user id.
create table public.admins (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        text not null default 'loan_officer' check (role in ('super_admin', 'master_admin', 'loan_officer')),
  is_active   boolean not null default true,
  receives_email_notifications boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  nrc_number  text not null unique,
  phone1      text not null,
  phone2      text,
  email       text,
  address     text not null,
  photo_url          text,                            -- file path inside the private 'client-photos' bucket
  nrc_photo_front_url text,                            -- NRC front, same bucket
  nrc_photo_back_url  text,                            -- NRC back, same bucket
  nrc_pdf_path         text,                           -- optional PDF fallback, private 'client-documents' bucket
  created_by  uuid default auth.uid() references public.admins(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.loans (
  id                      uuid primary key default gen_random_uuid(),
  loan_number             bigint generated always as identity,
  client_id               uuid not null references public.clients(id) on delete restrict,
  amount                  numeric(14,2) not null check (amount > 0),
  num_repayments          int           not null check (num_repayments between 1 and 1000),
  repayment_frequency     text not null default 'weekly'
                            check (repayment_frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannually', 'yearly')),
  interest_rate_per_period numeric(6,2) not null check (interest_rate_per_period >= 0),  -- percent per repayment
  -- calculated by the database itself, so they are always correct
  total_interest          numeric(14,2) generated always as (round(amount * interest_rate_per_period / 100 * num_repayments, 2)) stored,
  total_repayable         numeric(14,2) generated always as (round(amount + amount * interest_rate_per_period / 100 * num_repayments, 2)) stored,
  installment_amount      numeric(14,2) generated always as (round((amount + amount * interest_rate_per_period / 100 * num_repayments) / num_repayments, 2)) stored,
  amount_paid             numeric(14,2) not null default 0,
  -- Filled in only if this loan is settled ahead of schedule (see settle_loan_early below).
  settled_early           boolean not null default false,
  settlement_interest     numeric(14,2),
  settlement_total        numeric(14,2),
  settled_by              uuid references public.admins(id) on delete set null,
  settled_at              timestamptz,
  collateral_description  text not null,
  collateral_images       text[] not null default '{}',   -- file paths inside the private 'collateral-photos' bucket
  status                  text not null default 'pending'
                            check (status in ('pending', 'approved', 'paid', 'overdue', 'rejected')),
  rejection_reason        text,
  start_date              date,
  expected_pay_date       date,
  created_by              uuid constraint loans_created_by_fkey  references public.admins(id) on delete set null,
  approved_by             uuid constraint loans_approved_by_fkey references public.admins(id) on delete set null,
  approved_at             timestamptz,
  rejected_by             uuid constraint loans_rejected_by_fkey references public.admins(id) on delete set null,
  rejected_at             timestamptz,
  created_at              timestamptz not null default now(),
  constraint rejection_needs_reason
    check (status <> 'rejected' or length(trim(coalesce(rejection_reason, ''))) >= 3)
);

-- The repayment schedule: one row per installment, built when a loan is
-- approved (see approve_loan below). Used for reminders and, once Google
-- Calendar is connected, for calendar events.
create table public.installments (
  id                 uuid primary key default gen_random_uuid(),
  loan_id            uuid not null references public.loans(id) on delete cascade,
  period_no          int not null,
  due_date           date not null,
  amount_due         numeric(14,2) not null,
  calendar_event_id  text,
  reminder_2day_sent_at timestamptz,   -- so the client's "due in 2 days" email only ever sends once
  reminder_due_sent_at  timestamptz,   -- same, for the "due today" email
  unique (loan_id, period_no)
);

-- One row, always. Company branding for use across the app (and, later,
-- on receipts and documents).
create table public.company_settings (
  id              boolean primary key default true check (id),
  logo_path       text,
  signature_path  text,
  updated_by      uuid references public.admins(id) on delete set null,
  updated_at      timestamptz not null default now()
);
insert into public.company_settings (id) values (true);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  loan_id      uuid not null references public.loans(id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  paid_on      date not null default current_date,
  method       text not null default 'cash',
  note         text,
  recorded_by  uuid default auth.uid() references public.admins(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.admins(id) on delete set null,
  admin_name   text not null,             -- kept even if the admin is removed later
  action       text not null,             -- e.g. clients_insert, loan_approved
  entity_type  text not null,
  entity_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index on public.loans (status);
create index on public.loans (client_id);
create index on public.installments (loan_id);
create index on public.installments (due_date);
create index on public.payments (loan_id);
create index on public.activity_logs (created_at desc);

-- ---------------------------------------------------------------------
-- 2. WHO IS WHO
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where id = auth.uid() and is_active);
$$;

create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where id = auth.uid() and is_active and role in ('master_admin', 'super_admin'));
$$;

-- The developer's own tier, above Master Admin: can manage Master Admin
-- accounts and everything Master Admin can do (is_master() covers that).
create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where id = auth.uid() and is_active and role = 'super_admin');
$$;

-- ---------------------------------------------------------------------
-- 3. RULES THAT CANNOT BE BYPASSED FROM THE PHONE OR BROWSER
-- ---------------------------------------------------------------------
-- (Rules apply to signed-in app users. The SQL Editor / service role is not restricted.)

-- Lets a signed-in admin change ONLY their own notification preference -
-- nothing else about their own row, and nothing about anyone else's. A
-- service-role call (the manage-admin function) is unrestricted, exactly
-- like every other "self" rule in this schema.
create or replace function public.enforce_admin_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;

  if new.id <> auth.uid()
  or new.role       is distinct from old.role
  or new.is_active  is distinct from old.is_active
  or new.email      is distinct from old.email
  or new.full_name  is distinct from old.full_name then
    raise exception 'You can only change your own email notification preference here';
  end if;
  return new;
end $$;

create trigger trg_admins_self_edit before update on public.admins
  for each row execute function public.enforce_admin_self_edit();

create or replace function public.enforce_loan_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_internal boolean := coalesce(current_setting('app.internal', true), '') = '1';
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    -- Everyone, including the Master Admin, creates loans as Pending.
    new.status := 'pending';
    new.created_by := auth.uid();
    new.start_date := null;        new.expected_pay_date := null;
    new.approved_by := null;       new.approved_at := null;
    new.rejected_by := null;       new.rejected_at := null;
    new.rejection_reason := null;
    return new;
  end if;

  -- UPDATE: only the Master Admin may approve, reject or change the status / dates of a loan.
  -- (v_internal lets the automatic "fully paid" trigger flip the status without needing
  -- the Master Admin present - that is not a manual approval, just bookkeeping.)
  if not v_internal and not public.is_master() then
    if new.status            is distinct from old.status
    or new.start_date        is distinct from old.start_date
    or new.expected_pay_date is distinct from old.expected_pay_date
    or new.approved_by       is distinct from old.approved_by
    or new.approved_at       is distinct from old.approved_at
    or new.rejected_by       is distinct from old.rejected_by
    or new.rejected_at       is distinct from old.rejected_at
    or new.rejection_reason  is distinct from old.rejection_reason then
      raise exception 'Only the Master Admin can approve, reject or change the status of a loan';
    end if;
  end if;
  return new;
end $$;

create trigger trg_loans_rules before insert or update on public.loans
  for each row execute function public.enforce_loan_rules();

-- ---------------------------------------------------------------------
-- 4. ACTIVITY LOG (who did what, automatically)
-- ---------------------------------------------------------------------

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb; v_action text; v_details jsonb; v_client text; v_name text;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  v_action := tg_table_name || '_' || lower(tg_op);

  if tg_table_name = 'clients' then
    v_details := jsonb_build_object('name', v_row->>'full_name', 'nrc', v_row->>'nrc_number');

  elsif tg_table_name = 'loans' then
    select full_name into v_client from public.clients where id = (v_row->>'client_id')::uuid;
    v_details := jsonb_build_object('client', v_client, 'amount', v_row->>'amount', 'num_repayments', v_row->>'num_repayments', 'frequency', v_row->>'repayment_frequency');
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      v_action := 'loan_' || new.status;                    -- loan_approved, loan_rejected, loan_paid ...
      v_details := v_details || jsonb_build_object('status', old.status || ' -> ' || new.status);
      if new.status = 'rejected' then
        v_details := v_details || jsonb_build_object('reason', new.rejection_reason);
      end if;
    end if;

  else -- payments
    select c.full_name into v_client from public.loans l join public.clients c on c.id = l.client_id
      where l.id = (v_row->>'loan_id')::uuid;
    v_details := jsonb_build_object('client', v_client, 'amount', v_row->>'amount', 'method', v_row->>'method');
  end if;

  select full_name into v_name from public.admins where id = auth.uid();
  insert into public.activity_logs (admin_id, admin_name, action, entity_type, entity_id, details)
  values (auth.uid(), coalesce(v_name, 'system'), v_action, tg_table_name, (v_row->>'id')::uuid, v_details);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger trg_clients_log  after insert or update or delete on public.clients  for each row execute function public.log_change();
create trigger trg_loans_log    after insert or update or delete on public.loans    for each row execute function public.log_change();
create trigger trg_payments_log after insert or delete           on public.payments for each row execute function public.log_change();

-- ---------------------------------------------------------------------
-- 4b. APPROVAL WORKFLOW  (only the Master Admin can call these)
-- ---------------------------------------------------------------------

-- Approves a pending loan: sets today as the start date, works out the
-- expected payback date from the repayment frequency and count, records
-- who approved it and when, and builds the repayment schedule (one row
-- per installment, in public.installments) for reminders and calendar events.
create or replace function public.approve_loan(p_loan_id uuid)
returns public.loans
language plpgsql security definer set search_path = public as $$
declare
  v_loan public.loans;
  v_start date := (now() at time zone 'Africa/Lusaka')::date;
  v_expected date;
  v_due date;
  i int;
begin
  if not public.is_master() then
    raise exception 'Only the Master Admin can approve loans';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.status <> 'pending' then
    raise exception 'This loan is not waiting for approval';
  end if;

  v_expected := v_start + case v_loan.repayment_frequency
    when 'weekly'       then (v_loan.num_repayments * 7  || ' days')::interval
    when 'biweekly'     then (v_loan.num_repayments * 14 || ' days')::interval
    when 'monthly'      then (v_loan.num_repayments      || ' months')::interval
    when 'quarterly'    then (v_loan.num_repayments * 3  || ' months')::interval
    when 'semiannually' then (v_loan.num_repayments * 6  || ' months')::interval
    when 'yearly'       then (v_loan.num_repayments      || ' years')::interval
  end;

  update public.loans
     set status = 'approved',
         start_date = v_start,
         expected_pay_date = v_expected,
         approved_by = auth.uid(),
         approved_at = now()
   where id = p_loan_id
   returning * into v_loan;

  for i in 1..v_loan.num_repayments loop
    v_due := v_start + case v_loan.repayment_frequency
      when 'weekly'       then (i * 7  || ' days')::interval
      when 'biweekly'     then (i * 14 || ' days')::interval
      when 'monthly'      then (i      || ' months')::interval
      when 'quarterly'    then (i * 3  || ' months')::interval
      when 'semiannually' then (i * 6  || ' months')::interval
      when 'yearly'       then (i      || ' years')::interval
    end;
    insert into public.installments (loan_id, period_no, due_date, amount_due)
    values (p_loan_id, i, v_due, v_loan.installment_amount)
    on conflict (loan_id, period_no) do nothing;
  end loop;

  return v_loan;
end $$;

-- Rejects a pending loan. A reason of at least 3 characters is required
-- (the database itself also refuses a shorter one, as a backstop).
create or replace function public.reject_loan(p_loan_id uuid, p_reason text)
returns public.loans
language plpgsql security definer set search_path = public as $$
declare v_loan public.loans;
begin
  if not public.is_master() then
    raise exception 'Only the Master Admin can reject loans';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Please write the reason for rejecting this loan';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.status <> 'pending' then
    raise exception 'This loan is not waiting for approval';
  end if;

  update public.loans
     set status = 'rejected',
         rejection_reason = trim(p_reason),
         rejected_by = auth.uid(),
         rejected_at = now()
   where id = p_loan_id
   returning * into v_loan;

  return v_loan;
end $$;

revoke execute on function public.approve_loan(uuid)      from public, anon;
revoke execute on function public.reject_loan(uuid, text)  from public, anon;
grant  execute on function public.approve_loan(uuid)       to authenticated;
grant  execute on function public.reject_loan(uuid, text)  to authenticated;

-- ---------------------------------------------------------------------
-- 4c. PAYMENTS AND DASHBOARD
-- ---------------------------------------------------------------------

-- Keeps loans.amount_paid correct whenever a payment is added or removed,
-- and flips the loan to 'paid' once fully paid (or back to 'approved' if
-- a payment is later deleted and it's no longer fully paid). Uses the
-- settled total instead of the original one, once a loan has been
-- settled early (see settle_loan_early below).
create or replace function public.sync_loan_paid_amount() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_loan_id uuid := coalesce(new.loan_id, old.loan_id);
  v_total numeric; v_repayable numeric; v_status text; v_settled boolean; v_settlement numeric;
begin
  select coalesce(sum(amount), 0) into v_total from public.payments where loan_id = v_loan_id;
  select total_repayable, status, settled_early, settlement_total
    into v_repayable, v_status, v_settled, v_settlement
    from public.loans where id = v_loan_id;

  if v_settled and v_settlement is not null then
    v_repayable := v_settlement;
  end if;

  perform set_config('app.internal', '1', true);
  update public.loans
     set amount_paid = v_total,
         status = case
           when v_status = 'approved' and v_total >= v_repayable then 'paid'
           when v_status = 'paid' and v_total < v_repayable then 'approved'
           else v_status
         end
   where id = v_loan_id;

  return coalesce(new, old);
end $$;

create trigger trg_payments_sync after insert or update or delete on public.payments
  for each row execute function public.sync_loan_paid_amount();

-- Records a payment. Any active admin can call this; it checks the loan
-- is actually active and refuses an amount bigger than what's owed
-- (using the settled total once a loan has been settled early).
create or replace function public.record_payment(
  p_loan_id uuid, p_amount numeric, p_method text default 'cash',
  p_note text default null, p_paid_on date default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare v_loan public.loans; v_payment public.payments; v_effective_total numeric;
begin
  if not public.is_admin() then
    raise exception 'Not allowed';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.status not in ('approved', 'paid') then
    raise exception 'Payments can only be recorded on an approved loan';
  end if;

  v_effective_total := case when v_loan.settled_early then v_loan.settlement_total else v_loan.total_repayable end;
  if p_amount > (v_effective_total - v_loan.amount_paid) then
    raise exception 'That is more than the outstanding balance (K%)', round(v_effective_total - v_loan.amount_paid, 2);
  end if;

  insert into public.payments (loan_id, amount, method, note, paid_on, recorded_by)
  values (p_loan_id, p_amount, coalesce(nullif(p_method, ''), 'cash'), nullif(p_note, ''),
          coalesce(p_paid_on, (now() at time zone 'Africa/Lusaka')::date), auth.uid())
  returning * into v_payment;

  return v_payment;
end $$;

-- Master Admin only. Recalculates a loan's interest to cover only the
-- repayment periods that have actually elapsed since the start date
-- (rounding up - a part-way period still counts as one), for a client
-- who wants to clear the loan ahead of schedule. The original agreed
-- terms are kept; the settled figures are stored separately.
create or replace function public.settle_loan_early(p_loan_id uuid)
returns public.loans
language plpgsql security definer set search_path = public as $$
declare
  v_loan public.loans;
  v_period_days int;
  v_elapsed_days int;
  v_elapsed_periods int;
  v_new_interest numeric;
  v_new_total numeric;
begin
  if not public.is_master() then
    raise exception 'Only the Master Admin can settle a loan early';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.status <> 'approved' then
    raise exception 'Only an active loan can be settled early';
  end if;
  if v_loan.start_date is null then
    raise exception 'This loan has no start date yet';
  end if;

  v_period_days := case v_loan.repayment_frequency
    when 'weekly' then 7 when 'biweekly' then 14 when 'monthly' then 30
    when 'quarterly' then 91 when 'semiannually' then 182 when 'yearly' then 365
  end;

  v_elapsed_days := greatest(0, (now() at time zone 'Africa/Lusaka')::date - v_loan.start_date);
  v_elapsed_periods := least(v_loan.num_repayments, greatest(1, ceil(v_elapsed_days::numeric / v_period_days)::int));

  v_new_interest := round(v_loan.amount * v_loan.interest_rate_per_period / 100 * v_elapsed_periods, 2);
  v_new_total := round(v_loan.amount + v_new_interest, 2);
  if v_new_total < v_loan.amount_paid then
    v_new_total := v_loan.amount_paid;
    v_new_interest := round(v_new_total - v_loan.amount, 2);
  end if;

  update public.loans
     set settled_early = true,
         settlement_interest = v_new_interest,
         settlement_total = v_new_total,
         settled_by = auth.uid(),
         settled_at = now(),
         status = case when amount_paid >= v_new_total then 'paid' else status end
   where id = p_loan_id
   returning * into v_loan;

  return v_loan;
end $$;

-- The dashboard's headline numbers, in one call.
create or replace function public.dashboard_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_disbursed', coalesce((select sum(amount) from public.loans where status in ('approved', 'paid')), 0),
    'total_collected', coalesce((select sum(amount_paid) from public.loans), 0),
    'outstanding',     coalesce((select sum(coalesce(settlement_total, total_repayable) - amount_paid) from public.loans where status = 'approved'), 0),
    'overdue_count',   (select count(*) from public.loans
                         where status = 'approved'
                           and expected_pay_date < (now() at time zone 'Africa/Lusaka')::date
                           and amount_paid < coalesce(settlement_total, total_repayable)),
    'pending_count',   (select count(*) from public.loans where status = 'pending')
  );
$$;

revoke execute on function public.record_payment(uuid, numeric, text, text, date) from public, anon;
revoke execute on function public.settle_loan_early(uuid) from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
grant  execute on function public.record_payment(uuid, numeric, text, text, date) to authenticated;
grant  execute on function public.settle_loan_early(uuid) to authenticated;
grant  execute on function public.dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (who can see / change what)
-- ---------------------------------------------------------------------

alter table public.admins        enable row level security;
alter table public.clients       enable row level security;
alter table public.loans         enable row level security;
alter table public.installments  enable row level security;
alter table public.company_settings enable row level security;
alter table public.payments      enable row level security;
alter table public.activity_logs enable row level security;

revoke all on all tables in schema public from anon;   -- signed-out visitors get nothing

-- admins: you can always read your own row; admins can read the team list. Most changes go through
-- the manage-admin function; the one exception below lets you flip your own email switch directly.
create policy admins_read on public.admins for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy admins_update_self on public.admins for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- clients: any admin adds/edits; only the Master Admin deletes
create policy clients_read   on public.clients for select to authenticated using (public.is_admin());
create policy clients_add    on public.clients for insert to authenticated with check (public.is_admin());
create policy clients_edit   on public.clients for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy clients_delete on public.clients for delete to authenticated using (public.is_master());

-- loans: Loan Officers can only add loans (always Pending) and edit their OWN pending loans.
--        The Master Admin can edit (approve / reject) and delete.
create policy loans_read   on public.loans for select to authenticated using (public.is_admin());
create policy loans_add    on public.loans for insert to authenticated with check (public.is_admin());
create policy loans_edit   on public.loans for update to authenticated
  using      (public.is_master() or (public.is_admin() and created_by = auth.uid() and status = 'pending'))
  with check (public.is_master() or (public.is_admin() and created_by = auth.uid()));
create policy loans_delete on public.loans for delete to authenticated using (public.is_master());

-- payments: any admin records; only the Master Admin deletes
create policy payments_read   on public.payments for select to authenticated using (public.is_admin());
create policy installments_read on public.installments for select to authenticated using (public.is_admin());

-- company settings: any admin can read (for branding elsewhere in the app); only Master Admin+ can change it
create policy company_settings_read  on public.company_settings for select to authenticated using (public.is_admin());
create policy company_settings_write on public.company_settings for update to authenticated using (public.is_master()) with check (public.is_master());
create policy payments_add    on public.payments for insert to authenticated with check (public.is_admin());
create policy payments_delete on public.payments for delete to authenticated using (public.is_master());

-- activity log: Master Admin reads; nobody writes directly (the triggers above do)
create policy logs_read on public.activity_logs for select to authenticated using (public.is_master());

-- ---------------------------------------------------------------------
-- 6. PHOTO & DOCUMENT STORAGE (private; shown to the app with short-lived links)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('client-photos',     'client-photos',     false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('collateral-photos', 'collateral-photos', false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('client-documents',  'client-documents',  false, 10485760, array['application/pdf']),
  ('company-assets',    'company-assets',    false, 5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using (bucket_id in ('client-photos', 'collateral-photos') and public.is_admin());
create policy photos_add on storage.objects for insert to authenticated
  with check (bucket_id in ('client-photos', 'collateral-photos') and public.is_admin());
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id in ('client-photos', 'collateral-photos') and public.is_master());

create policy company_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'company-assets' and public.is_admin());
create policy company_assets_add on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets' and public.is_master());
create policy company_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets' and public.is_master());

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'client-documents' and public.is_admin());
create policy documents_add on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents' and public.is_admin());
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'client-documents' and public.is_master());
