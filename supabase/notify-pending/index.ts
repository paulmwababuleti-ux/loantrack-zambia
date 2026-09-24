// Called by the app right after a loan is created: emails the Master/Super
// Admins that a loan needs approval, and emails the client confirming
// their application was received.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { esc, money, requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/notify.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { me, db } = await requireAdmin(req);
    const { loan_id } = await req.json();

    const { data: loan } = await db.from('loans')
      .select('amount, num_repayments, repayment_frequency, interest_rate_per_period, total_repayable, installment_amount, status, clients(full_name, email)')
      .eq('id', loan_id).maybeSingle();
    if (!loan) return json({ error: 'Loan not found' }, 404);
    if (loan.status !== 'pending') return json({ sent: false, reason: 'not pending' });

    // deno-lint-ignore no-explicit-any
    const client = loan.clients as any;
    const appUrl = Deno.env.get('APP_URL') ?? '';

    const { data: masters } = await db.from('admins').select('email')
      .in('role', ['master_admin', 'super_admin']).eq('is_active', true).eq('receives_email_notifications', true);
    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:480px">
        <h2 style="margin:0 0 8px">Loan waiting for your approval</h2>
        <p>${esc(me.full_name)} created a loan for <b>${esc(client?.full_name)}</b>.</p>
        <table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">
          <tr><td>Amount</td><td><b>K${money(loan.amount)}</b></td></tr>
          <tr><td>Repayments</td><td>${loan.num_repayments} (${loan.repayment_frequency}) at ${loan.interest_rate_per_period}% each</td></tr>
          <tr><td>Total to repay</td><td>K${money(loan.total_repayable)}</td></tr>
          <tr><td>Each repayment</td><td>K${money(loan.installment_amount)}</td></tr>
        </table>
        ${appUrl ? `<p><a href="${appUrl}/loans" style="background:#0F6B4B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Review loan</a></p>` : ''}
      </div>`;
    const adminResult = await sendEmail(
      (masters ?? []).map((a: { email: string }) => a.email),
      `Loan needs approval - ${client?.full_name}`,
      adminHtml,
    );

    let clientResult: { sent: boolean; reason?: string } = { sent: false, reason: 'no client email on file' };
    if (client?.email) {
      const clientHtml = `
        <div style="font-family:Arial,sans-serif;max-width:480px">
          <p>Hello ${esc(client.full_name)},</p>
          <p>We've received your loan application for <b>K${money(loan.amount)}</b>. It is now
          <b>pending approval</b>, and we'll let you know as soon as a decision has been made.</p>
          <p>Thank you.</p>
        </div>`;
      clientResult = await sendEmail([client.email], 'Your loan application has been received', clientHtml);
    }

    return json({ admin: adminResult, client: clientResult });
  } catch (e) {
    return errorResponse(e);
  }
});
