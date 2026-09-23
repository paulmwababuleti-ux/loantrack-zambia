// Called by the app right after the Master Admin approves a loan.
// Creates one Google Calendar event per repayment and invites every admin.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { money, requireAdmin } from '../_shared/auth.ts';
import { createAllDayEvent, getAccessToken, googleConfigured } from '../_shared/google.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { db } = await requireAdmin(req, true);
    const { loan_id } = await req.json();

    const { data: loan } = await db.from('loans')
      .select('*, clients(full_name, phone1, phone2), installments(*)')
      .eq('id', loan_id).maybeSingle();
    if (!loan) return json({ error: 'Loan not found' }, 404);
    if (loan.status !== 'approved') return json({ error: 'This loan is not approved' }, 400);
    if (!googleConfigured()) return json({ calendar: 'skipped', created: 0, failed: 0 });

    const { data: admins } = await db.from('admins').select('email').eq('is_active', true);
    const attendees = (admins ?? []).map((a: { email: string }) => ({ email: a.email }));
    const token = await getAccessToken();

    // deno-lint-ignore no-explicit-any
    const todo = (loan.installments as any[]).filter((i) => !i.calendar_event_id).sort((a, b) => a.period_no - b.period_no);
    let created = 0, failed = 0;
    const errors: string[] = [];

    for (const inst of todo) {
      try {
        const phones = [loan.clients.phone1, loan.clients.phone2].filter(Boolean).join(' / ');
        const eventId = await createAllDayEvent(token, {
          summary: `Loan Repayment - ${loan.clients.full_name} - K${money(inst.amount_due)}`,
          description: [
            `Client: ${loan.clients.full_name}`,
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
    return json({ calendar: 'ok', created, failed, errors: errors.slice(0, 3) });
  } catch (e) {
    return errorResponse(e);
  }
});
