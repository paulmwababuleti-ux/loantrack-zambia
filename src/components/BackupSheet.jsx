import { useState } from 'react';
import { Database, Download, ShieldCheck } from 'lucide-react';
import { getLastBackup, runBackup } from '../lib/backup';
import { Banner, Sheet, Spinner } from './ui';

function relativeTime(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
}

export default function BackupSheet({ onClose }) {
  const [last, setLast] = useState(getLastBackup());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function backup() {
    setBusy(true);
    setError('');
    try {
      const counts = await runBackup();
      setResult(counts);
      setLast(getLastBackup());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Backup data" onClose={onClose}>
      <div className="space-y-4">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Database size={20} /></div>
          <div>
            <div className="text-xs text-stone-500">Last backup</div>
            <div className="text-[17px] font-semibold text-stone-900">{relativeTime(last)}</div>
          </div>
        </div>

        <p className="text-[15px] leading-relaxed text-stone-600">
          This saves all clients, loans and payments as one file on this device. Keep it somewhere safe,
          like Google Drive, email, or a USB stick. Photos and NRC documents are stored separately in Supabase
          and are not included in this file.
        </p>

        {result && (
          <Banner type="ok">
            Saved: {result.clients} clients, {result.loans} loans, {result.payments} payments.
          </Banner>
        )}
        {error && <Banner type="error">{error}</Banner>}

        <button className="btn-primary w-full" onClick={backup} disabled={busy}>
          {busy ? <Spinner /> : <Download size={20} />} Backup now
        </button>

        <div className="flex items-start gap-2 text-xs text-stone-400">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <span>{"LoanTrack reminds you to do this every 2 weeks; it can't be done silently in the background, so a tap is always needed."}</span>
        </div>
      </div>
    </Sheet>
  );
}
