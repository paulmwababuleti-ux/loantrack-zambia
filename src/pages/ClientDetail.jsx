import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, FileText, MapPin, MessageCircle, Pencil, Phone } from 'lucide-react';
import { getSignedUrl, supabase } from '../lib/supabase';
import { Avatar, EmptyState, Sheet, SignedImage, Spinner } from '../components/ui';
import ClientForm from '../components/ClientForm';
import { fmtDate, money, telHref } from '../lib/format';

/** An NRC photo, tappable to open full-size in a new tab (the signed link is fetched once and cached). */
function NrcPhoto({ path, label }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { getSignedUrl('client-photos', path).then(setUrl); }, [path]);
  return (
    <a href={url || '#'} target="_blank" rel="noreferrer" className="block">
      <div className="h-32 w-full overflow-hidden rounded-xl border border-stone-200">
        <SignedImage bucket="client-photos" path={path} alt={label} className="h-full w-full object-cover" />
      </div>
      <div className="mt-1 text-center text-xs text-stone-500">{label}</div>
    </a>
  );
}

/** Link to the NRC PDF, opened in a new tab once its signed link is ready. */
function NrcPdfLink({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { getSignedUrl('client-documents', path).then(setUrl); }, [path]);
  return (
    <a
      href={url || '#'} target="_blank" rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3.5 active:bg-stone-50"
    >
      <FileText size={22} className="shrink-0 text-brand-700" />
      <span className="flex-1 text-[15px] font-medium text-stone-900">NRC document (PDF)</span>
      <span className="text-xs font-semibold text-brand-700">Open</span>
    </a>
  );
}

function LoanCard({ loan }) {
  return (
    <div className="w-64 shrink-0 snap-start card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">{loan.status}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{money(loan.amount)}</div>
      <div className="mt-1 text-sm text-stone-500">{loan.weeks} weeks &middot; {Number(loan.interest_rate_per_week)}% / week</div>
      <div className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-600">
        Started {loan.start_date ? fmtDate(loan.start_date) : 'not yet'}
      </div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(undefined);
  const [loans, setLoans] = useState([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).maybeSingle(),
      supabase.from('loans').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ]);
    setClient(c.data ?? null);
    setLoans(l.data || []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (client === undefined) return <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>;
  if (client === null) return <EmptyState title="Client not found" />;

  return (
    <div className="space-y-6 pb-4">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 active:text-stone-800"><ArrowLeft size={18} /> Clients</Link>

      <div className="card flex flex-col items-center gap-3 p-6 text-center">
        <Avatar name={client.full_name} path={client.photo_url} size={96} />
        <div>
          <h1 className="text-2xl font-bold">{client.full_name}</h1>
          <p className="text-sm text-stone-500">NRC {client.nrc_number}</p>
        </div>
        <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={18} /> Edit details</button>
      </div>

      {/* Tap to call */}
      <div className="card divide-y divide-stone-100">
        <a href={telHref(client.phone1)} className="flex items-center gap-3 px-4 py-4 active:bg-stone-50">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Phone size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-stone-500">Phone</div>
            <div className="text-[17px] font-medium text-stone-900">{client.phone1}</div>
          </div>
          <span className="text-xs font-semibold text-brand-700">Call</span>
        </a>
        {client.phone2 && (
          <a href={telHref(client.phone2)} className="flex items-center gap-3 px-4 py-4 active:bg-stone-50">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Phone size={20} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-stone-500">Second phone</div>
              <div className="text-[17px] font-medium text-stone-900">{client.phone2}</div>
            </div>
            <span className="text-xs font-semibold text-brand-700">Call</span>
          </a>
        )}
        <a
          href={`https://wa.me/${telHref(client.phone1).replace('tel:+', '')}`}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-3 px-4 py-4 active:bg-stone-50"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><MessageCircle size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-stone-500">WhatsApp</div>
            <div className="text-[17px] font-medium text-stone-900">Message {client.full_name.split(' ')[0]}</div>
          </div>
        </a>
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><MapPin size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-stone-500">Address</div>
            <div className="text-[17px] font-medium text-stone-900">{client.address}</div>
          </div>
        </div>
      </div>

      {(client.nrc_photo_front_url || client.nrc_photo_back_url || client.nrc_pdf_path) && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><CreditCard size={20} /> NRC document</h2>
          {(client.nrc_photo_front_url || client.nrc_photo_back_url) && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              {client.nrc_photo_front_url && <NrcPhoto path={client.nrc_photo_front_url} label="Front" />}
              {client.nrc_photo_back_url && <NrcPhoto path={client.nrc_photo_back_url} label="Back" />}
            </div>
          )}
          {client.nrc_pdf_path && <NrcPdfLink path={client.nrc_pdf_path} />}
          <p className="mt-1.5 text-xs text-stone-400">Tap a photo or the PDF to view it full size.</p>
        </div>
      )}

      {/* Loans, swipeable cards */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Loans</h2>
          <span className="text-sm text-stone-500">{loans.length}</span>
        </div>
        {loans.length === 0 ? (
          <div className="card"><EmptyState title="No loans yet">Loan creation is built in Phase 3.</EmptyState></div>
        ) : (
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
            {loans.map((loan) => <LoanCard key={loan.id} loan={loan} />)}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-stone-400">Client added {fmtDate(client.created_at)}</p>

      {editing && (
        <Sheet title="Edit client" onClose={() => setEditing(false)}>
          <ClientForm initial={client} onCancel={() => setEditing(false)} onSaved={(c) => { setEditing(false); setClient(c); }} />
        </Sheet>
      )}
    </div>
  );
}
