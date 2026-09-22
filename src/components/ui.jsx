import { Loader2 } from 'lucide-react';

export const Spinner = ({ size = 20 }) => <Loader2 size={size} className="animate-spin" />;

export const FullScreenLoading = () => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-brand-600 text-white"><Spinner size={32} /></div>
);

export function Banner({ type = 'info', children }) {
  const cls = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  }[type];
  return <div role={type === 'error' ? 'alert' : undefined} className={`rounded-xl border px-4 py-3 text-[15px] leading-snug ${cls}`}>{children}</div>;
}

export function RoleBadge({ master, className = '' }) {
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${master ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'} ${className}`}>
      {master ? 'Master Admin' : 'Loan Officer'}
    </span>
  );
}

export function LogoMark({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#fff" fillOpacity="0.14" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M27 23v18M27 33l10-10M27.5 32.5L37.5 41" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
