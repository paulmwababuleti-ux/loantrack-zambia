// Emails all admins a summary of repayments due tomorrow. Uses the exact
// same "what's actually owed" logic as the app's Reminders screen: a
// shortfall from a missed period rolls into the next one shown, and an
// overpayment skips straight past whatever it covers.
//
// Can be run two ways:
//   1. The Master Admin taps "Email reminders now" in the app (normal login).
//   2. A scheduled job (pg_cron) calls it with the x-cron-secret header -
//      see docs/GOOGLE_CALENDAR_AND_EMAIL.md for the optional setup.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { adminClient, HttpError, money, requireAdmin } from '../_shared/auth.ts';
import { esc, sendEmail } from '../_shared/notify.ts';

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

type Installment = { period_no: number; due_date: string; amount_due: number };

function currentPeriod(installments: Installment[], amountPaid: number, today: string) {
  const sorted = [...installments].sort((a, b) => a.period_no - b.period_no);
  let cumulative = 0;
  const schedule = sorted.map((inst) => {
    cumulative += Number(inst.amount_due);
    const cumulativeOwed = Math.max(0, round2(cumulative - amountPaid));
    return { ...inst, cumulativeOwed, covered: cumulativeOwed <= 0.005 };
  });
  const elapsedUncovered = schedule.filter((s) => !s.covered && s.due_date <= today);
  if (elapsedUncovered.length > 0) {
    return elapsedUncovered.reduce((a, b) => (b.due_date > a.due_date ? b : a));
  }
  return schedule.find((s) => !s.covered) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const headerSecret = req.headers.get('x-cron-secret');
    const db = cronSecret && headerSecret === cronSecret
      ? adminClient()
      : (await requireAdmin(req, true)).db;

    const today = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 2 * 3600 * 1000 + 86400 * 1000).toISOString().slice(0, 10);

    const { data: loans, error } = await db
      .from('loans')
      .select('id, loan_number, amount_paid, clients(full_name, phone1), installments(period_no, due_date, amount_due)')
      .eq('status', 'approved');
    if (error) throw new HttpError(500, error.message);

    // deno-lint-ignore no-explicit-any
    const dueTomorrow = (loans ?? [])
      .map((loan: any) => ({ loan, current: currentPeriod(loan.installments ?? [], Number(loan.amount_paid), today) }))
      .filter(({ current }: any) => current && current.due_date === tomorrow);

    if (dueTomorrow.length === 0) return json({ tomorrow, due: 0, email: { sent: false, reason: 'nothing due tomorrow' } });

    const { data: admins } = await db.from('admins').select('email').eq('is_active', true);
    const to = (admins ?? []).map((a: { email: string }) => a.email);

    const rows = dueTomorrow.map(({ loan, current }: any) => `
      <tr>
        <td>${esc(loan.clients?.full_name)}</td>
        <td>${esc(loan.clients?.phone1)}</td>
        <td>K${money(current.cumulativeOwed)}</td>
      </tr>`).join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px">
        <h2 style="margin:0 0 8px">${dueTomorrow.length} repayment${dueTomorrow.length > 1 ? 's' : ''} due tomorrow (${tomorrow})</h2>
        <table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd;width:100%">
          <tr style="background:#f3f3f3;text-align:left"><th>Client</th><th>Phone</th><th>Amount</th></tr>
          ${rows}
        </table>
      </div>`;
    const result = await sendEmail(to, `${dueTomorrow.length} repayment(s) due tomorrow`, html);
    return json({ tomorrow, due: dueTomorrow.length, email: result });
  } catch (e) {
    return errorResponse(e);
  }
});
