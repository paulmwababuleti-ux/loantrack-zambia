-- =====================================================================
--  PHASE 5: DASHBOARD, PAYMENTS, EXPORT
--  Adds a running "amount_paid" total on each loan (kept correct
--  automatically), a function to record a payment safely, and a
--  function that returns the dashboard numbers in one call.
-- =====================================================================

-- Lets the automatic "fully paid" bookkeeping change a loan's status
-- even when a Loan Officer (not the Master Admin) recorded the payment
-- that completed it. Manual status changes still require the Master
-- Admin, exactly as before - only this one automatic case is allowed.
create or replace function public.enforce_loan_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_internal boolean := coalesce(current_setting('app.internal', true), '') = '1';
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.created_by := auth.uid();
    new.start_date := null;        new.expected_pay_date := null;
    new.approved_by := null;       new.approved_at := null;
    new.rejected_by := null;       new.rejected_at := null;
    new.rejection_reason := null;
    return new;
  end if;

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

alter table public.loans add column if not exists amount_paid numeric(14,2) not null default 0;

-- Keeps loans.amount_paid correct whenever a payment is added or removed,
-- and flips the loan to 'paid' once fully paid (or back to 'approved' if
-- a payment is later deleted and it's no longer fully paid).
create or replace function public.sync_loan_paid_amount() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_loan_id uuid := coalesce(new.loan_id, old.loan_id);
  v_total numeric; v_repayable numeric; v_status text;
begin
  select coalesce(sum(amount), 0) into v_total from public.payments where loan_id = v_loan_id;
  select total_repayable, status into v_repayable, v_status from public.loans where id = v_loan_id;

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

drop trigger if exists trg_payments_sync on public.payments;
create trigger trg_payments_sync after insert or update or delete on public.payments
  for each row execute function public.sync_loan_paid_amount();

-- Records a payment. Any active admin can call this; it checks the loan
-- is actually active and refuses an amount bigger than what's owed.
create or replace function public.record_payment(
  p_loan_id uuid, p_amount numeric, p_method text default 'cash',
  p_note text default null, p_paid_on date default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare v_loan public.loans; v_payment public.payments;
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
  if p_amount > (v_loan.total_repayable - v_loan.amount_paid) then
    raise exception 'That is more than the outstanding balance (K%)', round(v_loan.total_repayable - v_loan.amount_paid, 2);
  end if;

  insert into public.payments (loan_id, amount, method, note, paid_on, recorded_by)
  values (p_loan_id, p_amount, coalesce(nullif(p_method, ''), 'cash'), nullif(p_note, ''),
          coalesce(p_paid_on, (now() at time zone 'Africa/Lusaka')::date), auth.uid())
  returning * into v_payment;

  return v_payment;
end $$;

-- The dashboard's headline numbers, in one call.
create or replace function public.dashboard_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_disbursed', coalesce((select sum(amount) from public.loans where status in ('approved', 'paid')), 0),
    'total_collected', coalesce((select sum(amount_paid) from public.loans), 0),
    'outstanding',     coalesce((select sum(total_repayable - amount_paid) from public.loans where status = 'approved'), 0),
    'overdue_count',   (select count(*) from public.loans
                         where status = 'approved'
                           and expected_pay_date < (now() at time zone 'Africa/Lusaka')::date
                           and amount_paid < total_repayable),
    'pending_count',   (select count(*) from public.loans where status = 'pending')
  );
$$;

revoke execute on function public.record_payment(uuid, numeric, text, text, date) from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
grant  execute on function public.record_payment(uuid, numeric, text, text, date) to authenticated;
grant  execute on function public.dashboard_stats() to authenticated;
