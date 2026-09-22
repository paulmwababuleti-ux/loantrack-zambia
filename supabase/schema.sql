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
  role        text not null default 'loan_officer' check (role in ('master_admin', 'loan_officer')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  nrc_number  text not null unique,
  phone1      text not null,
  phone2      text,
  address     text not null,
  photo_url   text,                                   -- file path inside the private 'client-photos' bucket
  created_by  uuid default auth.uid() references public.admins(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.loans (
  id                      uuid primary key default gen_random_uuid(),
  loan_number             bigint generated always as identity,
  client_id               uuid not null references public.clients(id) on delete restrict,
  amount                  numeric(14,2) not null check (amount > 0),
  weeks                   int           not null check (weeks between 1 and 260),
  interest_rate_per_week  numeric(6,2)  not null check (interest_rate_per_week >= 0),   -- percent per week
  -- calculated by the database itself, so they are always correct
  total_interest          numeric(14,2) generated always as (round(amount * interest_rate_per_week / 100 * weeks, 2)) stored,
  total_repayable         numeric(14,2) generated always as (round(amount + amount * interest_rate_per_week / 100 * weeks, 2)) stored,
  weekly_installment      numeric(14,2) generated always as (round((amount + amount * interest_rate_per_week / 100 * weeks) / weeks, 2)) stored,
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
  select exists (select 1 from public.admins where id = auth.uid() and is_active and role = 'master_admin');
$$;

-- ---------------------------------------------------------------------
-- 3. RULES THAT CANNOT BE BYPASSED FROM THE PHONE OR BROWSER
-- ---------------------------------------------------------------------
-- (Rules apply to signed-in app users. The SQL Editor / service role is not restricted.)

create or replace function public.enforce_loan_rules() returns trigger
language plpgsql security definer set search_path = public as $$
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
  if not public.is_master() then
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
    v_details := jsonb_build_object('client', v_client, 'amount', v_row->>'amount', 'weeks', v_row->>'weeks');
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
-- 5. ROW LEVEL SECURITY (who can see / change what)
-- ---------------------------------------------------------------------

alter table public.admins        enable row level security;
alter table public.clients       enable row level security;
alter table public.loans         enable row level security;
alter table public.payments      enable row level security;
alter table public.activity_logs enable row level security;

revoke all on all tables in schema public from anon;   -- signed-out visitors get nothing

-- admins: you can always read your own row; admins can read the team list. Changes are made in the dashboard.
create policy admins_read on public.admins for select to authenticated
  using (id = auth.uid() or public.is_admin());

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
create policy payments_add    on public.payments for insert to authenticated with check (public.is_admin());
create policy payments_delete on public.payments for delete to authenticated using (public.is_master());

-- activity log: Master Admin reads; nobody writes directly (the triggers above do)
create policy logs_read on public.activity_logs for select to authenticated using (public.is_master());

-- ---------------------------------------------------------------------
-- 6. PHOTO STORAGE (private; shown to the app with short-lived links)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('client-photos',     'client-photos',     false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('collateral-photos', 'collateral-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using (bucket_id in ('client-photos', 'collateral-photos') and public.is_admin());
create policy photos_add on storage.objects for insert to authenticated
  with check (bucket_id in ('client-photos', 'collateral-photos') and public.is_admin());
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id in ('client-photos', 'collateral-photos') and public.is_master());
