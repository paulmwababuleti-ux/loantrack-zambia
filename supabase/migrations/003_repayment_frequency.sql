-- =====================================================================
--  Adds flexible repayment frequency (weekly / biweekly / monthly /
--  quarterly / semiannually / yearly) instead of always weeks.
--  Safe to run on your live project: existing loans keep their data
--  (their "weeks" becomes "num_repayments", and they default to the
--  'weekly' frequency, which is exactly what they already were).
-- =====================================================================

alter table public.loans rename column weeks to num_repayments;
alter table public.loans rename column interest_rate_per_week to interest_rate_per_period;
alter table public.loans rename column weekly_installment to installment_amount;

alter table public.loans
  add column if not exists repayment_frequency text not null default 'weekly'
    check (repayment_frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannually', 'yearly'));

alter table public.loans drop constraint if exists loans_weeks_check;
alter table public.loans add constraint loans_num_repayments_check check (num_repayments between 1 and 1000);

-- Keeps the activity log's saved details using the new column names.
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
      v_action := 'loan_' || new.status;
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
