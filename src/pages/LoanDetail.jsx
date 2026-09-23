import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { getSignedUrl, supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge, Banner, EmptyState, SignedImage, Spinner } from '../components/ui';
import LoanDecision from '../components/LoanDecision';
import PaymentSheet from '../components/PaymentSheet';
import SettleEarlySheet from '../components/SettleEarlySheet';
import { balance, fmtDate, frequencyLabel, frequencyPer, isOverdue, money } from '../lib/format';

/** A collateral photo thumbnail, tappable to open full-size in a new tab. */
function CollateralPhoto({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { getSignedUrl('collateral-photos', path).then(setUrl); }, [path]);
  return (
    <a href={url || '#'} target="_blank" rel="noreferrer" className="block h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-stone-200">
      <SignedImage bucket="collateral-photos" path={path} alt="Collateral" className="h-full w-full object-cover" />
    </a>
  );
}

export default function LoanDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { isMaster } = useAuth();
  const [loan, setLoan] = useState(undefined);
  const [payments, setPayments] = useState([]);
  const [recording, setRecording] = useState(false);
  const [settling, setSettling] = useState(false);
  const [banner, setBanner] = useState(location.state?.created ? 'Loan saved. It is Pending approval until the Master Admin approves it.' : '');

  const load = useCallback(async () => {
    const [{ data: loanData }, { data: paymentsData }] = await Promise.all([
      supabase.from('loans')
        .select(`*, clients(*),
          created_admin:admins!loans_created_by_fkey(full_name),
          approved_admin:admins!loans_approved_by_fkey(full_name),
          rejected_admin:admins!loans_rejected_by_fkey(full_name)`)
        .eq('id', id).maybeSingle(),
      supabase.from('payments').select('*, admins(full_name)').eq('loan_id', id).order('created_at', { ascending: false }),
    ]);
    setLoan(loanData ?? null);
    setPayments(paymentsData || []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loan === undefined) return <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>;
  if (loan === null) return <EmptyState title="Loan not found" />;

  const c = loan.clients;
  const overdue = isOverdue(loan);

  return (
    <div className="space-y-5 pb-4">
      <Link to="/loans" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 active:text-stone-800"><ArrowLeft size={18} /> Loans</Link>

      {banner && <Banner type="ok">{banner}</Banner>}

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <Link to={`/clients/${c.id}`} className="flex min-w-0 items-center gap-3">
            <Avatar name={c.full_name} path={c.photo_url} size={48} />
            <div className="min-w-0">
              <div className="truncate text-lg font-bold text-stone-900">{c.full_name}</div>
              <div className="truncate text-sm text-stone-500">{c.phone1}</div>
            </div>
          </Link>
          <Badge status={loan.status} />
        </div>

        {overdue && (
          <div className="mt-3">
            <Badge status="overdue" />
          </div>
        )}

        {loan.status === 'pending' && (
          <div className="mt-4 border-t border-stone-100 pt-4">
            {isMaster ? (
              <LoanDecision loan={loan} onDecided={(updated, note) => { setLoan((prev) => ({ ...prev, ...updated })); setBanner(note || (updated.status === 'approved' ? 'Loan approved.' : 'Loan rejected.')); }} />
            ) : (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-900">Waiting for the Master Admin to approve.</p>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-800">Loan breakdown</div>
        <dl className="divide-y divide-stone-100 px-5 text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Amount</dt><dd className="font-semibold">{money(loan.amount)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Repayments</dt><dd className="font-semibold">{loan.num_repayments}, {frequencyLabel(loan.repayment_frequency).toLowerCase()}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Interest rate</dt><dd className="font-semibold">{Number(loan.interest_rate_per_period)}% per {frequencyPer(loan.repayment_frequency)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Total interest</dt><dd className="font-semibold">{money(loan.total_interest)}</dd></div>
          <div className="flex justify-between py-2.5">
            <dt className="text-stone-600">Total repayable</dt>
            <dd className={`font-semibold ${loan.settled_early ? 'text-stone-400 line-through' : ''}`}>{money(loan.total_repayable)}</dd>
          </div>
          {loan.settled_early && (
            <div className="flex justify-between py-2.5"><dt className="text-stone-600">Settled total (early payoff)</dt><dd className="font-semibold text-emerald-700">{money(loan.settlement_total)}</dd></div>
          )}
          <div className="flex justify-between bg-brand-700 px-5 py-3 -mx-5 text-white"><dt>Each repayment</dt><dd className="font-display text-lg font-bold">{money(loan.installment_amount)}</dd></div>
          {(loan.status === 'approved' || loan.status === 'paid') && (
            <>
              <div className="flex justify-between py-2.5"><dt className="text-stone-600">Paid so far</dt><dd className="font-semibold text-emerald-700">{money(loan.amount_paid)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-stone-600">Balance</dt><dd className={`font-semibold ${overdue ? 'text-red-700' : ''}`}>{money(balance(loan))}</dd></div>
            </>
          )}
        </dl>
      </div>

      {loan.status === 'approved' && (
        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={() => setRecording(true)}>
            <Wallet size={20} /> Record payment
          </button>
          {isMaster && (
            <button type="button" onClick={() => setSettling(true)} className="mx-auto block text-sm font-medium text-brand-700 underline underline-offset-2">
              Settle this loan early
            </button>
          )}
        </div>
      )}

      <div className="card p-5 text-sm">
        <h2 className="mb-2 text-lg font-semibold">People and dates</h2>
        <dl className="space-y-1.5">
          <div><dt className="inline text-stone-500">Created by: </dt><dd className="inline font-medium">{loan.created_admin?.full_name || 'Unknown'} on {fmtDate(loan.created_at)}</dd></div>
          {loan.approved_at && <div><dt className="inline text-stone-500">Approved by: </dt><dd className="inline font-medium">{loan.approved_admin?.full_name || 'Unknown'}</dd></div>}
          {loan.rejected_at && <div><dt className="inline text-stone-500">Rejected by: </dt><dd className="inline font-medium">{loan.rejected_admin?.full_name || 'Unknown'}</dd></div>}
          {loan.start_date && <div><dt className="inline text-stone-500">Start date: </dt><dd className="inline font-medium">{fmtDate(loan.start_date)}</dd></div>}
          {loan.expected_pay_date && <div><dt className="inline text-stone-500">Expected payback: </dt><dd className="inline font-medium">{fmtDate(loan.expected_pay_date)}</dd></div>}
        </dl>
        {loan.status === 'rejected' && loan.rejection_reason && (
          <p className="mt-2 rounded-lg bg-stone-50 p-3 text-stone-700"><b>Reason:</b> {loan.rejection_reason}</p>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-2 text-lg font-semibold">Collateral</h2>
        <p className="whitespace-pre-line text-[15px] text-stone-700">{loan.collateral_description}</p>
        {loan.collateral_images?.length > 0 && (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {loan.collateral_images.map((path) => <CollateralPhoto key={path} path={path} />)}
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="card overflow-hidden">
          <div className="bg-stone-50 px-5 py-3 text-sm font-semibold text-stone-700">Payments received</div>
          <ul className="divide-y divide-stone-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-semibold text-stone-900">{money(p.amount)}</div>
                  <div className="text-xs text-stone-500">{fmtDate(p.paid_on)} &middot; {p.method.replace('_', ' ')}{p.note ? ` · ${p.note}` : ''}</div>
                </div>
                <div className="text-xs text-stone-400">{p.admins?.full_name || 'Unknown'}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recording && (
        <PaymentSheet
          loan={loan}
          onClose={() => setRecording(false)}
          onRecorded={() => { setRecording(false); setBanner('Payment recorded.'); load(); }}
        />
      )}

      {settling && (
        <SettleEarlySheet
          loan={loan}
          onClose={() => setSettling(false)}
          onSettled={(updated) => { setSettling(false); setLoan((prev) => ({ ...prev, ...updated })); setBanner('Loan settled early. The reduced total is shown below.'); }}
        />
      )}
    </div>
  );
}
