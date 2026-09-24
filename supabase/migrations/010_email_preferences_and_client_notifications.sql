-- =====================================================================
--  Adds:
--   1. A per-admin "receive email notifications" switch.
--   2. Tracking so a client's 2-day-before and due-today repayment
--      reminders are each sent at most once (needed once the daily
--      email job is scheduled - see docs/GOOGLE_CALENDAR_AND_EMAIL.md).
-- =====================================================================

alter table public.admins add column if not exists receives_email_notifications boolean not null default true;

-- Lets a signed-in admin change ONLY their own notification preference -
-- nothing else about their own row, and nothing about anyone else's.
-- (A service-role call, like the manage-admin function, is unrestricted,
-- exactly like every other "self" rule in this schema.)
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

drop trigger if exists trg_admins_self_edit on public.admins;
create trigger trg_admins_self_edit before update on public.admins
  for each row execute function public.enforce_admin_self_edit();

drop policy if exists admins_update_self on public.admins;
create policy admins_update_self on public.admins for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

alter table public.installments
  add column if not exists reminder_2day_sent_at timestamptz,
  add column if not exists reminder_due_sent_at  timestamptz;
