// Runs once a day (or whenever the Master Admin taps the button):
//   1. Emails all admins a summary of what's due tomorrow.
//   2. Emails each CLIENT whose next payment is due in exactly 2 days,
//      and again on the day it's due - each only ever once, so a client
//      never gets the same reminder twice even if this runs more than
//      once on the same day.
// Uses the exact same "what's actually owed" logic as the app's Reminders
// screen: a shortfall from a missed period rolls into the next one shown,
// and an overpayment skips straight past whatever it covers.
//
// Can be run two ways:
//   1. The Master Admin taps "Email reminders now" in the app (normal login).
//   2. A scheduled job (pg_cron) calls it with the x-cron-secret header -
//      see docs/GOOGLE_CALENDAR_AND_EMAIL.md.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { adminClient, esc, HttpError, money, requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/notify.ts';

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

type Installment = { id: string; period_no: number; due_date: string; amount_due: number };

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

const addDays = (dateStr: string, n: number) => {
  const t = new Date(dateStr + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const headerSecret = req.headers.get('x-cron-secret');
    const db = cronSecret && headerSecret === cronSecret
      ? adminClient()
      : (await requireAdmin(req, true)).db;

    const today = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    const tomorrow = addDays(today, 1);
    const in2Days = addDays(today, 2);

    const { data: loans, error } = await db
      .from('loans')
      .select('id, loan_number, amount_paid, clients(full_name, phone1, email), installments(id, period_no, due_date, amount_due, reminder_2day_sent_at, reminder_due_sent_at)')
      .eq('status', 'approved');
    if (error) throw new HttpError(500, error.message);

    // deno-lint-ignore no-explicit-any
    const withCurrent = (loans ?? []).map((loan: any) => ({ loan, current: currentPeriod(loan.installments ?? [], Number(loan.amount_paid), today) }));

    // ---------- 1. Admin summary: what's due tomorrow ----------
    // deno-lint-ignore no-explicit-any
    const dueTomorrow = withCurrent.filter(({ current }: any) => current && current.due_date === tomorrow);
    let adminEmail: { sent: boolean; reason?: string } = { sent: false, reason: 'nothing due tomorrow' };
    if (dueTomorrow.length > 0) {
      const { data: admins } = await db.from('admins').select('email').eq('is_active', true).eq('receives_email_notifications', true);
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
      adminEmail = await sendEmail(
        (admins ?? []).map((a: { email: string }) => a.email),
        `${dueTomorrow.length} repayment(s) due tomorrow`,
        html,
      );
    }

    // ---------- 2. Client reminders: due in 2 days, and due today ----------
    let clients2Day = 0, clientsDueToday = 0;
    const clientErrors: string[] = [];

    for (const { loan, current } of withCurrent) {
      if (!current) continue;
      // deno-lint-ignore no-explicit-any
      const client = (loan as any).clients;
      if (!client?.email) continue;

      const due2Day = current.due_date === in2Days && !current.reminder_2day_sent_at;
      const dueToday = current.due_date === today && !current.reminder_due_sent_at;
      if (!due2Day && !dueToday) continue;

      const when = dueToday ? 'today' : 'in 2 days';
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px">
          <p>Hello ${esc(client.full_name)},</p>
          <p>This is a reminder that your loan payment of <b>K${money(current.cumulativeOwed)}</b> is due ${when}
          (${current.due_date}).</p>
          <p>Thank you for staying on top of your payments.</p>
        </div>`;
      try {
        const result = await sendEmail([client.email], `Loan payment due ${when}`, html);
        if (result.sent) {
          const column = dueToday ? 'reminder_due_sent_at' : 'reminder_2day_sent_at';
          await db.from('installments').update({ [column]: new Date().toISOString() }).eq('id', current.id);
          if (dueToday) clientsDueToday++; else clients2Day++;
        } else {
          clientErrors.push(`${client.full_name}: ${result.reason?.slice(0, 100)}`);
        }
      } catch (e) {
        clientErrors.push(`${client.full_name}: ${(e as Error).message}`);
      }
    }

    return json({
      tomorrow, due: dueTomorrow.length, adminEmail,
      clients2Day, clientsDueToday, clientErrors: clientErrors.slice(0, 5),
    });
  } catch (e) {
    return errorResponse(e);
  }
});
