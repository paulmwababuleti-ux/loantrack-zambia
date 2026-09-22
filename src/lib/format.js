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
