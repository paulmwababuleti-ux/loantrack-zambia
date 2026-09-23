import { supabase } from './supabase';

/** Master Admin only (also enforced by the database). Approves a pending loan. */
export async function approveLoan(loanId) {
  const { data, error } = await supabase.rpc('approve_loan', { p_loan_id: loanId });
  if (error) throw new Error(error.message);
  return data;
}

/** Master Admin only (also enforced by the database). Rejects a pending loan; a reason is required. */
export async function rejectLoan(loanId, reason) {
  const { data, error } = await supabase.rpc('reject_loan', { p_loan_id: loanId, p_reason: reason });
  if (error) throw new Error(error.message);
  return data;
}

/** Any active admin (also enforced by the database). Records a payment; refuses more than the balance owed. */
export async function recordPayment(loanId, { amount, method = 'cash', note = '', paidOn = null }) {
  const { data, error } = await supabase.rpc('record_payment', {
    p_loan_id: loanId, p_amount: Number(amount), p_method: method, p_note: note || null, p_paid_on: paidOn,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function dashboardStats() {
  const { data, error } = await supabase.rpc('dashboard_stats');
  if (error) throw new Error(error.message);
  return data;
}

/** Master Admin only (also enforced by the database). Recalculates interest for an early payoff. */
export async function settleLoanEarly(loanId) {
  const { data, error } = await supabase.rpc('settle_loan_early', { p_loan_id: loanId });
  if (error) throw new Error(error.message);
  return data;
}
