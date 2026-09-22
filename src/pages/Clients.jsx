import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Plus, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Avatar, EmptyState, PullToRefresh, Sheet, Spinner } from '../components/ui';
import ClientForm from '../components/ClientForm';
import { fmtDate, telHref } from '../lib/format';

export default function Clients() {
  const [clients, setClients] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (!error) setClients(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients || [];
    return (clients || []).filter((c) =>
      [c.full_name, c.phone1, c.phone2, c.nrc_number].some((v) => v?.toLowerCase().includes(term)));
  }, [clients, q]);

  return (
    <div className="relative">
      {/* Big search bar */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-stone-200 bg-paper px-4 pb-3 pt-1">
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="input pl-11 pr-11"
            placeholder="Search name, phone or NRC"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button aria-label="Clear search" onClick={() => setQ('')} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 active:bg-stone-100">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {clients === null ? (
        <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>
      ) : (
        <PullToRefresh onRefresh={load}>
          {filtered.length === 0 ? (
            <EmptyState title={q ? 'No clients match your search' : 'No clients yet'}>
              {q ? 'Try a different name, phone or NRC number.' : 'Tap the + button to add your first client.'}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {filtered.map((c) => (
                <li key={c.id} className="card flex items-center gap-3 p-3">
                  <Link to={`/clients/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={c.full_name} path={c.photo_url} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] font-semibold text-stone-900">{c.full_name}</div>
                      <div className="truncate text-sm text-stone-500">{c.phone1} &middot; NRC {c.nrc_number}</div>
                      <div className="text-xs text-stone-400">Added {fmtDate(c.created_at)}</div>
                    </div>
                  </Link>
                  <a
                    href={telHref(c.phone1)}
                    aria-label={`Call ${c.full_name}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 active:bg-brand-100"
                  >
                    <Phone size={22} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </PullToRefresh>
      )}

      {/* Floating add button */}
      <button
        aria-label="Add client"
        onClick={() => setAdding(true)}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg active:bg-brand-800"
      >
        <Plus size={30} />
      </button>

      {adding && (
        <Sheet title="Add client" onClose={() => setAdding(false)}>
          <ClientForm
            onCancel={() => setAdding(false)}
            onSaved={(c) => { setAdding(false); setClients((prev) => [c, ...(prev || [])]); }}
          />
        </Sheet>
      )}
    </div>
  );
}
