export const APP_MONEY_SYMBOL = 'K';

export const money = (n) =>
  APP_MONEY_SYMBOL + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d) => {
  if (!d) return '-';
  const date = typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const initials = (name = '') =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** 0977 123 456 -> +260977123456 (Zambia). Numbers already in international format are kept. */
export function normalizePhone(raw) {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '260' + d.slice(1);
  if (!d.startsWith('260') && d.length === 9) d = '260' + d;
  return '+' + d;
}

export const telHref = (phone) => `tel:${normalizePhone(phone)}`;

/** wa.me link with a message pre-filled, ready for the admin to tap Send. */
export const waLink = (phone, text) => `https://wa.me/${normalizePhone(phone).replace('+', '')}?text=${encodeURIComponent(text)}`;

/** Same maths as the database's generated columns, so the live preview always matches what gets saved. */
export function calcLoan(amount, ratePerPeriod, numRepayments) {
  const a = Number(amount) || 0;
  const r = Number(ratePerPeriod) || 0;
  const n = Number(numRepayments) || 0;
  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const interest = round2((a * r * n) / 100);
  const total = round2(a + interest);
  const perRepayment = n > 0 ? round2(total / n) : 0;
  return { interest, total, perRepayment };
}

/** How often repayments are collected. `days` is an approximation, used only for rough previews. */
export const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly', per: 'week', days: 7 },
  { value: 'biweekly', label: 'Every 2 weeks', per: '2 weeks', days: 14 },
  { value: 'monthly', label: 'Monthly', per: 'month', days: 30 },
  { value: 'quarterly', label: 'Every 3 months', per: '3 months', days: 91 },
  { value: 'semiannually', label: 'Every 6 months', per: '6 months', days: 182 },
  { value: 'yearly', label: 'Yearly', per: 'year', days: 365 },
];

export const frequencyLabel = (value) => FREQUENCY_OPTIONS.find((f) => f.value === value)?.label || value;
export const frequencyPer = (value) => FREQUENCY_OPTIONS.find((f) => f.value === value)?.per || value;

export const STATUS_LABEL = {
  pending: 'Pending approval',
  approved: 'Approved',
  paid: 'Paid',
  overdue: 'Overdue',
  rejected: 'Rejected',
};

export const STATUS_TONE = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  paid: 'bg-sky-100 text-sky-900',
  overdue: 'bg-red-100 text-red-900',
  rejected: 'bg-stone-200 text-stone-700',
};

/** Today's date in Zambia (UTC+2) as YYYY-MM-DD, so "overdue" always compares against the right day. */
export const todayZM = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);

/** An approved loan is overdue once its payback date has passed without being fully paid. */
export const isOverdue = (loan) =>
  loan.status === 'approved' && loan.expected_pay_date && loan.expected_pay_date < todayZM();

/** The amount actually owed on this loan: the settled total if settled early, otherwise the original. */
export const effectiveTotal = (loan) =>
  loan.settled_early && loan.settlement_total != null ? Number(loan.settlement_total) : Number(loan.total_repayable);

export const balance = (loan) => Math.max(0, effectiveTotal(loan) - Number(loan.amount_paid));

/**
 * Works out, on the phone, what an early settlement would charge - the same
 * maths the database uses - so the Master Admin can see it before confirming.
 * Returns null if the loan isn't in a state where this makes sense yet.
 */
export function previewEarlySettlement(loan) {
  if (loan.status !== 'approved' || !loan.start_date) return null;
  const periodDays = FREQUENCY_OPTIONS.find((f) => f.value === loan.repayment_frequency)?.days || 7;
  const elapsedDays = Math.max(0, (new Date(todayZM()) - new Date(loan.start_date)) / 86400000);
  const elapsedPeriods = Math.min(loan.num_repayments, Math.max(1, Math.ceil(elapsedDays / periodDays)));
  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  let newInterest = round2(Number(loan.amount) * Number(loan.interest_rate_per_period) / 100 * elapsedPeriods);
  let newTotal = round2(Number(loan.amount) + newInterest);
  if (newTotal < Number(loan.amount_paid)) {
    newTotal = Number(loan.amount_paid);
    newInterest = round2(newTotal - Number(loan.amount));
  }
  return { elapsedPeriods, newInterest, newTotal, remaining: Math.max(0, round2(newTotal - Number(loan.amount_paid))) };
}
