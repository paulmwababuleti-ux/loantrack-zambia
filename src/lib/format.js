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
