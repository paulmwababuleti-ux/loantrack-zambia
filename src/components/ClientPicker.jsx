import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, UserPlus, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ClientForm from './ClientForm';
import { Avatar, EmptyState, Sheet, Spinner } from './ui';

/** A button that opens a searchable full-screen list of clients to choose from, with a way to add a new one right there. */
export default function ClientPicker({ value, onSelect }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [clients, setClients] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open || clients) return;
    supabase.from('clients').select('id, full_name, phone1, nrc_number, photo_url').order('full_name')
      .then(({ data }) => setClients(data || []));
  }, [open, clients]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients || [];
    return (clients || []).filter((c) =>
      [c.full_name, c.phone1, c.nrc_number].some((v) => v?.toLowerCase().includes(term)));
  }, [clients, q]);

  function close() {
    setOpen(false);
    setAdding(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="input flex items-center justify-between gap-3 text-left"
      >
        {value ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={value.full_name} path={value.photo_url} size={32} />
            <span className="min-w-0 truncate font-medium text-stone-900">{value.full_name}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2.5 text-stone-400"><UserRound size={20} /> Select a client</span>
        )}
        <ChevronRight size={20} className="shrink-0 text-stone-400" />
      </button>

      {open && (
        <Sheet title={adding ? 'Add client' : 'Select client'} onClose={close}>
          {adding ? (
            <ClientForm
              onCancel={() => setAdding(false)}
              onSaved={(c) => {
                setClients((prev) => [...(prev || []), c].sort((a, b) => a.full_name.localeCompare(b.full_name)));
                onSelect(c);
                close();
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mb-3 flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 p-3 text-left active:bg-brand-100"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"><UserPlus size={20} /></div>
                <span className="font-semibold text-brand-800">Client not listed? Add new client</span>
              </button>

              <div className="relative mb-3">
                <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input className="input pl-11" placeholder="Search name, phone or NRC" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {!clients ? (
                <div className="flex justify-center py-10 text-brand-700"><Spinner size={24} /></div>
              ) : filtered.length === 0 ? (
                <EmptyState title="No clients match">Try a different name, phone or NRC number, or add them above.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { onSelect(c); close(); }}
                        className="flex w-full items-center gap-3 rounded-xl border border-stone-200 p-3 text-left active:bg-stone-50"
                      >
                        <Avatar name={c.full_name} path={c.photo_url} size={44} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-stone-900">{c.full_name}</div>
                          <div className="truncate text-sm text-stone-500">{c.phone1} &middot; NRC {c.nrc_number}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
