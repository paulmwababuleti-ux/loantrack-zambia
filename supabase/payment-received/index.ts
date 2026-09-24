// Called by the app right after a payment is recorded. Emails the client
// a confirmation of the amount paid and their new balance - with a
// congratulations if this payment was on time or early.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { esc, money, requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/notify.ts';

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { db } = await requireAdmin(req);
    const { loan_id, amount, paid_on } = await req.json();

    const { data: loan } = await db.from('loans')
      .select('amount_paid, total_repayable, settled_early, settlement_total, clients(full_name, email), installments(period_no, due_date, amount_due)')
      .eq('id', loan_id).maybeSingle();
    if (!loan) return json({ error: 'Loan not found' }, 404);

    // deno-lint-ignore no-explicit-any
    const client = loan.clients as any;
    if (!client?.email) return json({ sent: false, reason: 'no client email on file' });

    const effectiveTotal = loan.settled_early && loan.settlement_total != null ? Number(loan.settlement_total) : Number(loan.total_repayable);
    const amountPaidAfter = Number(loan.amount_paid);
    const amountPaidBefore = round2(amountPaidAfter - Number(amount));
    const balance = Math.max(0, round2(effectiveTotal - amountPaidAfter));

    // Which installment was still outstanding right before this payment landed - used to judge "on time".
    // deno-lint-ignore no-explicit-any
    const sorted = [...(loan.installments as any[])].sort((a, b) => a.period_no - b.period_no);
    let cumulative = 0;
    let coveredPeriod = null;
    for (const inst of sorted) {
      cumulative += Number(inst.amount_due);
      if (cumulative > amountPaidBefore + 0.005) { coveredPeriod = inst; break; }
    }
    const onTime = coveredPeriod ? String(paid_on) <= coveredPeriod.due_date : true;

    const praise = onTime
      ? `<p style="color:#0F6B4B"><b>Thank you for paying on time - keep it up!</b></p>`
      : '';
    const balanceLine = balance > 0
      ? `<p>Your remaining balance is <b>K${money(balance)}</b>.</p>`
      : `<p><b>This loan is now fully paid off. Thank you!</b></p>`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px">
        <p>Hello ${esc(client.full_name)},</p>
        <p>We've received your payment of <b>K${money(amount)}</b> on ${esc(paid_on)}.</p>
        ${praise}
        ${balanceLine}
        <p>Thank you.</p>
      </div>`;
    const result = await sendEmail([client.email], 'Payment received - thank you', html);
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
});
