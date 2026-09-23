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
