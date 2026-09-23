import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, File, FileText, Plus, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Avatar, Badge, EmptyState, PullToRefresh, Sheet, Spinner } from '../components/ui';
import { balance, fmtDate, frequencyLabel, isOverdue, money, STATUS_LABEL } from '../lib/format';
import { exportExcel, exportPDF } from '../lib/export';

const STATUS_OPTIONS = ['approved', 'paid', 'overdue', 'rejected'];

export default function Loans() {
  const [loans, setLoans] = useState(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('loans')
      .select('*, clients(full_name, phone1, photo_url)')
      .order('created_at', { ascending: false });
    if (!error) setLoans(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCount = useMemo(() => (loans || []).filter((l) => l.status === 'pending').length, [loans]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (loans || [])
      .filter((l) => (tab === 'pending' ? l.status === 'pending' : true))
      .filter((l) => (tab === 'all' && statusFilter ? (statusFilter === 'overdue' ? isOverdue(l) : l.status === statusFilter) : true))
      .filter((l) => !term || [l.clients?.full_name, l.clients?.phone1].some((v) => v?.toLowerCase().includes(term)));
  }, [loans, q, tab, statusFilter]);

  const exportRows = () =>
    filtered.map((l) => ({
      Client: l.clients?.full_name,
      Phone: l.clients?.phone1,
      Amount: Number(l.amount),
      Repayments: l.num_repayments,
      Frequency: frequencyLabel(l.repayment_frequency),
      'Rate %': Number(l.interest_rate_per_period),
      'Total interest': Number(l.total_interest),
      'Total repayable': Number(l.total_repayable),
      'Settled early': l.settled_early ? 'Yes' : 'No',
      'Settled total': l.settled_early ? Number(l.settlement_total) : '',
      Paid: Number(l.amount_paid),
      Outstanding: l.status === 'approved' ? balance(l) : 0,
      Status: isOverdue(l) ? 'Overdue' : STATUS_LABEL[l.status] || l.status,
      'Start date': l.start_date || '',
      'Expected payback': l.expected_pay_date || '',
    }));

  async function onExportExcel() {
    setExporting(false);
    await exportExcel(exportRows(), `loans-${new Date().toISOString().slice(0, 10)}`);
  }
  async function onExportPdf() {
    setExporting(false);
    const rows = exportRows();
    const cols = ['Client', 'Phone', 'Amount', 'Repayments', 'Total repayable', 'Paid', 'Outstanding', 'Status'];
    await exportPDF('Loans', cols, rows.map((r) => [
      r.Client, r.Phone, money(r.Amount), `${r.Repayments}x ${r.Frequency}`, money(r['Total repayable']), money(r.Paid), money(r.Outstanding), r.Status,
    ]), `loans-${new Date().toISOString().slice(0, 10)}`);
  }

  return (
    <div className="relative">
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-stone-200 bg-paper px-4 pb-3 pt-1">
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setTab('all')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${tab === 'all' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            All loans
          </button>
          <button
            onClick={() => setTab('pending')}
            className={`relative flex-1 rounded-xl py-2.5 text-sm font-semibold ${tab === 'pending' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            Pending
            {pendingCount > 0 && (
              <span className={`ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs font-bold ${tab === 'pending' ? 'bg-white text-brand-700' : 'bg-red-600 text-white'}`}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input pl-11 pr-11" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button aria-label="Clear search" onClick={() => setQ('')} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 active:bg-stone-100">
                <X size={18} />
              </button>
            )}
          </div>
          <button aria-label="Export" className="btn-ghost !w-14 shrink-0 px-0" onClick={() => setExporting(true)}>
            <Download size={20} />
          </button>
        </div>

        {tab === 'all' && (
          <select className="input mt-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
          </select>
        )}
      </div>

      {loans === null ? (
        <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>
      ) : (
        <PullToRefresh onRefresh={load}>
          {filtered.length === 0 ? (
            <EmptyState title={tab === 'pending' ? 'Nothing waiting for approval' : 'No loans match'}>
              {tab === 'pending' ? 'All loans have been approved or rejected.' : 'Try a different search or filter.'}
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
                    <div className="flex flex-col items-end gap-1">
                      <Badge status={l.status} />
                      {isOverdue(l) && <Badge status="overdue" />}
                    </div>
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

      {exporting && (
        <Sheet title="Export loans" onClose={() => setExporting(false)}>
          <p className="mb-4 text-sm text-stone-500">Exports the {filtered.length} loan{filtered.length === 1 ? '' : 's'} currently shown.</p>
          <div className="space-y-3">
            <button className="btn-ghost w-full" onClick={onExportExcel}><File size={20} /> Export as Excel</button>
            <button className="btn-ghost w-full" onClick={onExportPdf}><FileText size={20} /> Export as PDF</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
