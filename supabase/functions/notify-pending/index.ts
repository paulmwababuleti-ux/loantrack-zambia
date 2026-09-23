// Called by the app right after a loan is created: emails the Master Admin(s)
// that a loan needs approval.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { money, requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/notify.ts';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { me, db } = await requireAdmin(req);
    const { loan_id } = await req.json();

    const { data: loan } = await db.from('loans')
      .select('amount, num_repayments, repayment_frequency, interest_rate_per_period, total_repayable, installment_amount, status, clients(full_name)')
      .eq('id', loan_id).maybeSingle();
    if (!loan) return json({ error: 'Loan not found' }, 404);
    if (loan.status !== 'pending') return json({ sent: false, reason: 'not pending' });

    const { data: masters } = await db.from('admins').select('email').eq('role', 'master_admin').eq('is_active', true);
    const to = (masters ?? []).map((a: { email: string }) => a.email);
    // deno-lint-ignore no-explicit-any
    const clientName = (loan.clients as any)?.full_name;
    const appUrl = Deno.env.get('APP_URL') ?? '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px">
        <h2 style="margin:0 0 8px">Loan waiting for your approval</h2>
        <p>${esc(me.full_name)} created a loan for <b>${esc(clientName)}</b>.</p>
        <table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">
          <tr><td>Amount</td><td><b>K${money(loan.amount)}</b></td></tr>
          <tr><td>Repayments</td><td>${loan.num_repayments} (${loan.repayment_frequency}) at ${loan.interest_rate_per_period}% each</td></tr>
          <tr><td>Total to repay</td><td>K${money(loan.total_repayable)}</td></tr>
          <tr><td>Each repayment</td><td>K${money(loan.installment_amount)}</td></tr>
        </table>
        ${appUrl ? `<p><a href="${appUrl}/loans" style="background:#0F6B4B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Review loan</a></p>` : ''}
      </div>`;
    const result = await sendEmail(to, `Loan needs approval - ${clientName}`, html);
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
});
