-- =====================================================================
--  EARLY SETTLEMENT
--  Lets the Master Admin recalculate a loan's interest to only cover
--  the repayment periods that have actually elapsed, when a client
--  wants to clear the loan ahead of schedule. The original agreed
--  terms stay on record; the settled figures are stored separately.
-- =====================================================================

alter table public.loans
  add column if not exists settled_early boolean not null default false,
  add column if not exists settlement_interest numeric(14,2),
  add column if not exists settlement_total numeric(14,2),
  add column if not exists settled_by uuid references public.admins(id) on delete set null,
  add column if not exists settled_at timestamptz;

-- Master Admin only. Works out how many repayment periods have passed
-- since the start date (rounding up - a part-way period still counts
-- as one), charges interest for just those, and stores the reduced
-- total. It does not record a payment by itself.
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
  -- Never set the reduced total below what has already been collected.
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

revoke execute on function public.settle_loan_early(uuid) from public, anon;
grant  execute on function public.settle_loan_early(uuid) to authenticated;

-- The functions below now use the settled total (once a loan has been
-- settled early) instead of the original total_repayable.

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
