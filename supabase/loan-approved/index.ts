// Called by the app right after the Master Admin approves a loan.
// Creates one Google Calendar event per repayment (if Google is connected)
// and emails the client that their loan was approved (if they have an
// email on file and Resend is connected). The two are independent - one
// not being set up never stops the other.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { esc, money, requireAdmin } from '../_shared/auth.ts';
import { createAllDayEvent, getAccessToken, googleConfigured } from '../_shared/google.ts';
import { sendEmail } from '../_shared/notify.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { db } = await requireAdmin(req, true);
    const { loan_id } = await req.json();

    const { data: loan } = await db.from('loans')
      .select('*, clients(full_name, phone1, phone2, email), installments(*)')
      .eq('id', loan_id).maybeSingle();
    if (!loan) return json({ error: 'Loan not found' }, 404);
    if (loan.status !== 'approved') return json({ error: 'This loan is not approved' }, 400);

    // deno-lint-ignore no-explicit-any
    const client = loan.clients as any;
    let created = 0, failed = 0;
    const errors: string[] = [];

    if (googleConfigured()) {
      const { data: admins } = await db.from('admins').select('email').eq('is_active', true);
      const attendees = (admins ?? []).map((a: { email: string }) => ({ email: a.email }));
      const token = await getAccessToken();

      // deno-lint-ignore no-explicit-any
      const todo = (loan.installments as any[]).filter((i) => !i.calendar_event_id).sort((a, b) => a.period_no - b.period_no);
      for (const inst of todo) {
        try {
          const phones = [client.phone1, client.phone2].filter(Boolean).join(' / ');
          const eventId = await createAllDayEvent(token, {
            summary: `Loan Repayment - ${client.full_name} - K${money(inst.amount_due)}`,
            description: [
              `Client: ${client.full_name}`,
              `Phone: ${phones}`,
              `Amount due this period: K${money(inst.amount_due)}`,
              `Period ${inst.period_no} of ${loan.num_repayments} (${loan.repayment_frequency})`,
              `Collateral: ${loan.collateral_description}`,
            ].join('\n'),
            date: inst.due_date,
            attendees,
          });
          await db.from('installments').update({ calendar_event_id: eventId }).eq('id', inst.id);
          created++;
        } catch (e) {
          failed++;
          errors.push((e as Error).message);
        }
      }
    }

    let clientEmail: { sent: boolean; reason?: string } = { sent: false, reason: 'no client email on file' };
    if (client?.email) {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px">
          <p>Hello ${esc(client.full_name)},</p>
          <p>Good news - your loan for <b>K${money(loan.amount)}</b> has been <b>approved</b>.</p>
          <table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">
            <tr><td>Start date</td><td>${loan.start_date}</td></tr>
            <tr><td>Repayments</td><td>${loan.num_repayments} (${loan.repayment_frequency})</td></tr>
            <tr><td>Each repayment</td><td>K${money(loan.installment_amount)}</td></tr>
            <tr><td>Expected payback date</td><td>${loan.expected_pay_date}</td></tr>
          </table>
          <p>Thank you for choosing us.</p>
        </div>`;
      clientEmail = await sendEmail([client.email], 'Your loan has been approved', html);
    }

    return json({ calendar: googleConfigured() ? 'ok' : 'skipped', created, failed, errors: errors.slice(0, 3), client: clientEmail });
  } catch (e) {
    return errorResponse(e);
  }
});
