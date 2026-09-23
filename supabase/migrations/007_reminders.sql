-- =====================================================================
--  PHASE 6: REMINDERS
--  Adds a repayment schedule (one row per installment, with its own due
--  date) so the app can show what's due, and Google Calendar can get
--  one event per repayment. Built at approval time, using whatever
--  frequency was chosen for the loan - not just weekly.
-- =====================================================================

create table if not exists public.installments (
  id                 uuid primary key default gen_random_uuid(),
  loan_id            uuid not null references public.loans(id) on delete cascade,
  period_no          int not null,
  due_date           date not null,
  amount_due         numeric(14,2) not null,
  calendar_event_id  text,
  unique (loan_id, period_no)
);

create index if not exists installments_loan_id_idx on public.installments (loan_id);
create index if not exists installments_due_date_idx on public.installments (due_date);

alter table public.installments enable row level security;
drop policy if exists installments_read on public.installments;
create policy installments_read on public.installments for select to authenticated using (public.is_admin());

-- Approves a pending loan, same as before, and now also builds the
-- repayment schedule: one row per installment with its own due date.
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
