import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, Clock, Download, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dashboardStats } from '../lib/loans';
import { needsBackupReminder, runBackup } from '../lib/backup';
import { money } from '../lib/format';
import { Spinner } from '../components/ui';
import InstallPrompt from '../components/InstallPrompt';

function StatCard({ to, icon: Icon, label, value, tone = 'text-stone-900', iconTone = 'bg-brand-50 text-brand-700' }) {
  const content = (
    <div className="card h-full p-4">
      <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-full ${iconTone}`}><Icon size={18} /></div>
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
  return to ? <Link to={to} className="block active:opacity-80">{content}</Link> : content;
}

export default function Home() {
  const { admin, isMaster } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [showBackupReminder, setShowBackupReminder] = useState(needsBackupReminder());
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState('');

  useEffect(() => {
    dashboardStats().then(setStats).catch((err) => setStatsError(err.message));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  async function backupNow() {
    setBackupBusy(true);
    setBackupError('');
    try {
      await runBackup();
      setShowBackupReminder(false);
    } catch (err) {
      setBackupError(err.message);
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-bold">{greeting}, {admin?.full_name?.split(' ')[0]}</h2>
        <p className="mt-1 text-base text-stone-600">
          {isMaster ? 'You are the Master Admin: you can approve loans and delete records.' : 'You are a Loan Officer: you can add clients and create loans. The Master Admin approves them.'}
        </p>
      </div>

      {showBackupReminder && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[15px] font-semibold text-amber-900">It's been a while since your last backup</p>
          <p className="mt-0.5 text-sm text-amber-800">Save a copy of your client and loan records to this device.</p>
          {backupError && <p className="mt-2 text-sm text-red-700">{backupError}</p>}
          <button className="btn-primary mt-3" onClick={backupNow} disabled={backupBusy}>
            {backupBusy ? <Spinner /> : <Download size={18} />} Backup now
          </button>
        </div>
      )}

      <section>
        <h3 className="mb-2 text-lg font-semibold">Dashboard</h3>
        {statsError ? (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{statsError}</p>
        ) : !stats ? (
          <div className="flex justify-center py-10 text-brand-700"><Spinner size={26} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Banknote} label="Total disbursed" value={money(stats.total_disbursed)} />
            <StatCard icon={Wallet} label="Total collected" value={money(stats.total_collected)} iconTone="bg-emerald-50 text-emerald-700" />
            <StatCard icon={Clock} label="Outstanding" value={money(stats.outstanding)} />
            <StatCard
              to="/reminders" icon={AlertTriangle} label="Overdue loans" value={stats.overdue_count}
              tone={stats.overdue_count > 0 ? 'text-red-700' : 'text-stone-900'}
              iconTone="bg-red-50 text-red-600"
            />
            <StatCard
              to="/loans" icon={Clock} label="Pending approval" value={stats.pending_count}
              tone={stats.pending_count > 0 ? 'text-amber-700' : 'text-stone-900'}
              iconTone="bg-amber-50 text-amber-700"
            />
          </div>
        )}
      </section>

      <InstallPrompt />
    </div>
  );
}
