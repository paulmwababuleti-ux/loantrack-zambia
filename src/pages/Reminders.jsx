import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { loadFullScheduleByDate, loadReminders } from '../lib/reminders';
import { callFn } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PullToRefresh, Sheet, Spinner } from '../components/ui';
import MonthCalendar from '../components/MonthCalendar';
import { fmtDate, money, telHref, waLink } from '../lib/format';

function message(entry, group) {
  if (group === 'overdue') {
    return `Hello ${entry.client}, your loan payment of ${money(entry.amountDue)} was due on ${fmtDate(entry.dueDate)}. Please make your payment as soon as you can.`;
  }
  if (group === 'onDate') {
    return `Hello ${entry.client}, reminder your loan payment of ${money(entry.amountDue)} is due on ${fmtDate(entry.dueDate)}.`;
  }
  const when = group === 'dueToday' ? 'today' : 'tomorrow';
  return `Hello ${entry.client}, reminder your loan payment of ${money(entry.amountDue)} is due ${when}.`;
}

function EntryRow({ e, group }) {
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/loans/${e.loanId}`} className="min-w-0">
          <div className="truncate text-[17px] font-semibold text-stone-900">{e.client}</div>
          <div className="text-sm text-stone-500">Period {e.periodNo}{e.totalPeriods ? ` of ${e.totalPeriods}` : ''} &middot; due {fmtDate(e.dueDate)}</div>
        </Link>
        <div className="shrink-0 text-right text-[17px] font-bold text-stone-900">{money(e.amountDue)}</div>
      </div>
      <div className="mt-3 flex gap-2">
        <a href={telHref(e.phone)} className="btn-ghost flex-1"><Phone size={18} /> Call</a>
        <a href={waLink(e.phone, message(e, group))} target="_blank" rel="noreferrer" className="btn-primary flex-1">
          <MessageCircle size={18} /> WhatsApp
        </a>
      </div>
    </li>
  );
}

function Group({ title, tone, entries, group }) {
  if (entries.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-2 text-lg font-bold ${tone}`}>{title} ({entries.length})</h2>
      <ul className="card divide-y divide-stone-100">
        {entries.map((e) => <EntryRow key={`${e.loanId}-${e.periodNo}`} e={e} group={group} />)}
      </ul>
    </section>
  );
}

export default function Reminders() {
  const { isMaster } = useAuth();
  const [view, setView] = useState('list');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [monthData, setMonthData] = useState(null);
  const [dayPicked, setDayPicked] = useState(null); // { date, entries }
  const [emailing, setEmailing] = useState(false);
  const [emailResult, setEmailResult] = useState('');

  const load = async () => {
    try {
      const [reminders, byDate] = await Promise.all([loadReminders(), loadFullScheduleByDate()]);
      setData(reminders);
      setMonthData(byDate);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  async function emailReminders() {
    setEmailing(true);
    setEmailResult('');
    try {
      const r = await callFn('daily-reminders', {});
      const parts = [];
      if (r.due === 0) parts.push('Nothing due tomorrow for admins.');
      else if (r.adminEmail?.sent) parts.push(`Emailed admins about ${r.due} repayment(s) due tomorrow.`);
      else parts.push(`Admin email failed: ${r.adminEmail?.reason || 'check that Resend is connected.'}`);

      if (r.clients2Day || r.clientsDueToday) {
        parts.push(`Emailed ${r.clients2Day} client(s) due in 2 days and ${r.clientsDueToday} due today.`);
      }
      setEmailResult(parts.join(' '));
    } catch (err) {
      setEmailResult(`Could not send: ${err.message}`);
    } finally {
      setEmailing(false);
    }
  }

  if (error) return <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>;

  const total = data.overdue.length + data.dueToday.length + data.dueTomorrow.length;

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-3xl font-bold">Reminders</h1>
        <p className="mt-1 text-base text-stone-600">Tap WhatsApp to send a ready-made reminder - just tap Send.</p>
      </div>

      {isMaster && (
        <div>
          <button className="btn-ghost w-full" onClick={emailReminders} disabled={emailing}>
            {emailing ? <Spinner size={18} /> : <Mail size={18} />} Email reminders now
          </button>
          {emailResult && <p className="mt-2 text-center text-sm text-stone-600">{emailResult}</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setView('list')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${view === 'list' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'}`}
        >
          Due soon
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${view === 'calendar' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'}`}
        >
          Calendar
        </button>
      </div>

      {view === 'list' ? (
        <PullToRefresh onRefresh={load}>
          {total === 0 ? (
            <EmptyState title="Nothing due right now">Check back tomorrow, or pull down to refresh.</EmptyState>
          ) : (
            <div className="space-y-6">
              <Group title="Overdue" tone="text-red-700" entries={data.overdue} group="overdue" />
              <Group title="Due today" tone="text-amber-700" entries={data.dueToday} group="dueToday" />
              <Group title="Due tomorrow" tone="text-stone-900" entries={data.dueTomorrow} group="dueTomorrow" />
            </div>
          )}
        </PullToRefresh>
      ) : (
        <div>
          <MonthCalendar entriesByDate={monthData || {}} onSelectDay={(date, entries) => setDayPicked({ date, entries })} />
          <p className="mt-2 text-center text-xs text-stone-400">Tap a highlighted day to see who's due.</p>
        </div>
      )}

      {dayPicked && (
        <Sheet title={fmtDate(dayPicked.date)} onClose={() => setDayPicked(null)}>
          <ul className="card divide-y divide-stone-100">
            {dayPicked.entries.map((e) => <EntryRow key={`${e.loanId}-${e.periodNo}`} e={e} group="onDate" />)}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
