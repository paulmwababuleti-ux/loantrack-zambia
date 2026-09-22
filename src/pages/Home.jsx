import { useEffect, useState } from 'react';
import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { isStandalone, useOnline, useServiceWorkerStatus } from '../lib/pwa';
import InstallPrompt from '../components/InstallPrompt';

const TABLES = ['clients', 'loans', 'payments'];

function Row({ state, title, detail }) {
  const icon = {
    ok: <CheckCircle2 size={24} className="text-emerald-600" />,
    bad: <XCircle size={24} className="text-red-600" />,
    idle: <MinusCircle size={24} className="text-stone-400" />,
  }[state];
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="break-words text-[15px] leading-snug text-stone-600">{detail}</div>
      </div>
    </li>
  );
}

export default function Home() {
  const { admin, isMaster } = useAuth();
  const online = useOnline();
  const sw = useServiceWorkerStatus();
  const [db, setDb] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all(TABLES.map((t) => supabase.from(t).select('id', { count: 'exact', head: true }))).then((rs) => {
      if (alive) setDb(TABLES.map((t, i) => ({ table: t, count: rs[i].count, error: rs[i].error?.message })));
    });
    return () => { alive = false; };
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dbError = db?.find((d) => d.error);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-bold">{greeting}, {admin?.full_name?.split(' ')[0]}</h2>
        <p className="mt-1 text-base text-stone-600">
          {isMaster ? 'You are the Master Admin: you can approve loans and delete records.' : 'You are a Loan Officer: you can add clients and create loans. The Master Admin approves them.'}
        </p>
      </div>

      <InstallPrompt />

      <section>
        <h3 className="mb-2 text-lg font-semibold">Phase 1 check</h3>
        <ul className="card divide-y divide-stone-100">
          <Row state="ok" title="Signed in" detail={admin?.email} />
          <Row
            state={!db ? 'idle' : dbError ? 'bad' : 'ok'}
            title="Database connected"
            detail={!db ? 'Checking...' : dbError
              ? `${dbError.table}: ${dbError.error}. Did you run schema.sql in Supabase?`
              : db.map((d) => `${d.table} (${d.count})`).join(', ') + ' tables are reachable.'}
          />
          <Row state={online ? 'ok' : 'bad'} title="Internet" detail={online ? 'Online' : 'Offline. You need a connection to sign in and save.'} />
          <Row
            state={isStandalone() ? 'ok' : 'idle'}
            title="How it is open"
            detail={isStandalone() ? 'As an installed app (full screen).' : 'In a browser tab. Install it to open it like an app.'}
          />
          <Row
            state={sw === 'active' ? 'ok' : 'idle'}
            title="App files saved on device"
            detail={sw === 'active' ? 'Service worker is active.' : sw === 'unsupported' ? 'This browser does not support it.' : 'Not active yet. It starts on the live https site after the first visit.'}
          />
        </ul>
      </section>
    </div>
  );
}
