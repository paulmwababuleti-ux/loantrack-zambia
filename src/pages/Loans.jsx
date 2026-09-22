import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Avatar, Badge, EmptyState, PullToRefresh, Spinner } from '../components/ui';
import { fmtDate, frequencyLabel, money } from '../lib/format';

export default function Loans() {
  const [loans, setLoans] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('loans')
      .select('*, clients(full_name, phone1, photo_url)')
      .order('created_at', { ascending: false });
    if (!error) setLoans(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return loans || [];
    return (loans || []).filter((l) =>
      [l.clients?.full_name, l.clients?.phone1].some((v) => v?.toLowerCase().includes(term)));
  }, [loans, q]);

  return (
    <div className="relative">
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-stone-200 bg-paper px-4 pb-3 pt-1">
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-11 pr-11" placeholder="Search by client name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button aria-label="Clear search" onClick={() => setQ('')} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 active:bg-stone-100">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {loans === null ? (
        <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>
      ) : (
        <PullToRefresh onRefresh={load}>
          {filtered.length === 0 ? (
            <EmptyState title={q ? 'No loans match your search' : 'No loans yet'}>
              {q ? 'Try a different name or phone number.' : 'Tap the + button to create the first loan.'}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {filtered.map((l) => (
                <li key={l.id}>
                  <Link to={`/loans/${l.id}`} className="card flex items-center gap-3 p-3 active:bg-stone-50">
                    <Avatar name={l.clients?.full_name} path={l.clients?.photo_url} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] font-semibold text-stone-900">{l.clients?.full_name}</div>
                      <div className="text-sm text-stone-500">{money(l.amount)} &middot; {l.num_repayments}x {frequencyLabel(l.repayment_frequency).toLowerCase()}</div>
                      <div className="text-xs text-stone-400">Created {fmtDate(l.created_at)}</div>
                    </div>
                    <Badge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PullToRefresh>
      )}

      <Link
        to="/loans/new"
        aria-label="New loan"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg active:bg-brand-800"
      >
        <Plus size={30} />
      </Link>
    </div>
  );
}
