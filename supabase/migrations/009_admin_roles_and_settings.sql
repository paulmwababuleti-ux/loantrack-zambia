-- =====================================================================
--  THREE-TIER ROLES AND A SETTINGS AREA
--  Adds a 'super_admin' role above Master Admin (for you, the
--  developer), and a Settings page for company branding + managing
--  admin accounts from inside the app instead of the SQL Editor.
--
--  Role hierarchy: super_admin > master_admin > loan_officer.
--  Everywhere the app already checks "is this the Master Admin?" now
--  also allows the Super Admin, since Super Admin can do everything
--  Master Admin can, plus manage Master Admin accounts themselves.
-- =====================================================================

alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check
  check (role in ('super_admin', 'master_admin', 'loan_officer'));

create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where id = auth.uid() and is_active and role in ('master_admin', 'super_admin'));
$$;

create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where id = auth.uid() and is_active and role = 'super_admin');
$$;

-- ---------------------------------------------------------------------
-- Company branding (one row: logo and signature for use across the app,
-- e.g. on receipts and documents later)
-- ---------------------------------------------------------------------

create table if not exists public.company_settings (
  id            boolean primary key default true check (id),  -- always exactly one row
  logo_path     text,
  signature_path text,
  updated_by    uuid references public.admins(id) on delete set null,
  updated_at    timestamptz not null default now()
);
insert into public.company_settings (id) values (true) on conflict (id) do nothing;

alter table public.company_settings enable row level security;
drop policy if exists company_settings_read on public.company_settings;
drop policy if exists company_settings_write on public.company_settings;
create policy company_settings_read  on public.company_settings for select to authenticated using (public.is_admin());
create policy company_settings_write on public.company_settings for update to authenticated using (public.is_master()) with check (public.is_master());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('company-assets', 'company-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists company_assets_read on storage.objects;
drop policy if exists company_assets_add on storage.objects;
drop policy if exists company_assets_delete on storage.objects;
create policy company_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'company-assets' and public.is_admin());
create policy company_assets_add on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets' and public.is_master());
create policy company_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets' and public.is_master());
