import { supabase } from './supabase';
import { todayZM } from './format';

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const addDaysZM = (n) => new Date(Date.now() + 2 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

/**
 * Works out what's cumulatively owed AT each period - the running total
 * of every period's amount up to and including this one, minus what's
 * actually been paid. A period counts as "covered" once payments have
 * caught up to it.
 */
function computeSchedule(installments, amountPaid) {
  const sorted = [...installments].sort((a, b) => a.period_no - b.period_no);
  let cumulative = 0;
  return sorted.map((inst) => {
    cumulative += Number(inst.amount_due);
    const cumulativeOwed = Math.max(0, round2(cumulative - Number(amountPaid)));
    return { ...inst, cumulativeOwed, covered: cumulativeOwed <= 0.005 };
  });
}

/**
 * For one loan, works out what's actually due right now and what's
 * coming up, in order:
 *  - If a payment falls short, the shortfall carries into the next
 *    period rather than disappearing - so once that next period's date
 *    arrives, its shown amount is its own installment PLUS whatever was
 *    still owed from before (e.g. K10,000 short by K4,000 becomes a
 *    K14,000 ask next period, not two separate reminders).
 *  - If a payment is more than what's owed, it's credited forward, so
 *    the whole schedule - and the next reminder's date - moves on to
 *    whichever period isn't covered yet, even skipping some entirely.
 *  - Periods still further ahead keep their own plain amount, since
 *    nothing has happened to them yet; they're shown for planning.
 */
function buildLoanEntries(loan) {
  const schedule = computeSchedule(loan.installments || [], loan.amount_paid);
  const today = todayZM();

  const elapsedUncovered = schedule.filter((s) => !s.covered && s.due_date <= today);
  let currentIdx;
  if (elapsedUncovered.length > 0) {
    // Several missed periods in a row collapse into just the most recent one,
    // since its running total already includes everything before it.
    const latest = elapsedUncovered.reduce((a, b) => (b.due_date > a.due_date ? b : a));
    currentIdx = schedule.findIndex((s) => s.period_no === latest.period_no);
  } else {
    currentIdx = schedule.findIndex((s) => !s.covered);
  }
  if (currentIdx === -1) return []; // fully covered, nothing outstanding

  return schedule.slice(currentIdx).map((s, i) => ({
    loanId: loan.id,
    client: loan.clients?.full_name || 'Unknown',
    phone: loan.clients?.phone1 || '',
    periodNo: s.period_no,
    totalPeriods: loan.num_repayments,
    dueDate: s.due_date,
    amountDue: i === 0 ? s.cumulativeOwed : Number(s.amount_due),
  }));
}

async function loadApprovedLoanSchedules() {
  const { data, error } = await supabase
    .from('loans')
    .select('id, amount_paid, num_repayments, clients(full_name, phone1), installments(period_no, due_date, amount_due)')
    .eq('status', 'approved');
  if (error) throw new Error(error.message);
  return data || [];
}

/** Just the one currently-outstanding period per loan, sorted into overdue / today / tomorrow. */
export async function loadReminders() {
  const loans = await loadApprovedLoanSchedules();
  const today = todayZM();
  const tomorrow = addDaysZM(1);
  const overdue = [], dueToday = [], dueTomorrow = [];

  for (const loan of loans) {
    const current = buildLoanEntries(loan)[0];
    if (!current) continue;
    if (current.dueDate < today) overdue.push(current);
    else if (current.dueDate === today) dueToday.push(current);
    else if (current.dueDate === tomorrow) dueTomorrow.push(current);
  }
  const byDate = (a, b) => a.dueDate.localeCompare(b.dueDate);
  return { overdue: overdue.sort(byDate), dueToday: dueToday.sort(byDate), dueTomorrow: dueTomorrow.sort(byDate) };
}

/**
 * The full outstanding schedule (current period plus everything still
 * ahead) across all approved loans, grouped by due date, for the
 * Reminders page's month calendar. Fetches once; the caller filters to
 * whichever month is being viewed, so flipping months needs no more
 * trips to the database.
 */
export async function loadFullScheduleByDate() {
  const loans = await loadApprovedLoanSchedules();
  const byDate = {};
  for (const loan of loans) {
    for (const e of buildLoanEntries(loan)) (byDate[e.dueDate] ||= []).push(e);
  }
  for (const list of Object.values(byDate)) list.sort((a, b) => a.client.localeCompare(b.client));
  return byDate;
}
