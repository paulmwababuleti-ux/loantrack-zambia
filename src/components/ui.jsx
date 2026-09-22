import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { getSignedUrl } from '../lib/supabase';
import { initials } from '../lib/format';

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

export function EmptyState({ title, children, action }) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-lg font-semibold text-stone-700">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-xs text-[15px] text-stone-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A private client/collateral photo, fetched as a short-lived signed link and shown as an <img>. */
export function SignedImage({ bucket, path, alt = '', className = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!path) return;
    getSignedUrl(bucket, path).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [bucket, path]);
  if (!url) return <div className={`animate-pulse bg-stone-200 ${className}`} />;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

export function Avatar({ name = '', path, size = 48 }) {
  const style = { width: size, height: size, minWidth: size };
  if (path) {
    return (
      <div style={style} className="overflow-hidden rounded-full">
        <SignedImage bucket="client-photos" path={path} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div style={style} className="flex items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800" >
      <span style={{ fontSize: size * 0.36 }}>{initials(name) || '?'}</span>
    </div>
  );
}

/** Full-screen sheet on mobile, centered card on wider screens. Slides up from the bottom. */
export function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white md:items-center md:justify-center md:bg-black/40">
      <div className="drawer-up flex h-full w-full flex-col md:h-auto md:max-h-[88vh] md:max-w-lg md:rounded-2xl md:shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 pt-[env(safe-area-inset-top)] pb-3 pt-3 md:rounded-t-2xl">
          <h2 className="text-xl font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 active:bg-stone-100"><X size={24} /></button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white px-4 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-stone-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

/** Simple touch-drag pull-to-refresh, for browsers/PWAs with no native pull gesture. */
export function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const THRESHOLD = 70;

  function onTouchStart(e) {
    if (window.scrollY <= 0) startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e) {
    if (startY.current == null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPull(Math.min(delta * 0.5, 90));
  }
  async function onTouchEnd() {
    if (pull > THRESHOLD) {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
    }
    setPull(0);
    startY.current = null;
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="flex items-center justify-center overflow-hidden text-brand-700 transition-[height]"
        style={{ height: refreshing ? 40 : pull }}
      >
        {(refreshing || pull > 10) && <Spinner size={20} className={refreshing ? 'animate-spin' : pull > THRESHOLD ? 'animate-spin' : ''} />}
      </div>
      {children}
    </div>
  );
}
