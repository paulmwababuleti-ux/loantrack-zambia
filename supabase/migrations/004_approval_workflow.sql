-- =====================================================================
--  PHASE 4: APPROVAL WORKFLOW
--  Adds two functions the app calls to approve or reject a pending loan.
--  No table changes needed - every column they use already exists.
--  Only the Master Admin can call these (checked inside each function,
--  and the trigger from Phase 1 already blocks anyone else from
--  changing a loan's status directly).
-- =====================================================================

-- Approves a pending loan: sets today as the start date, works out the
-- expected payback date from the repayment frequency and count, and
-- records who approved it and when.
create or replace function public.approve_loan(p_loan_id uuid)
returns public.loans
language plpgsql security definer set search_path = public as $$
declare
  v_loan public.loans;
  v_start date := (now() at time zone 'Africa/Lusaka')::date;
  v_expected date;
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
