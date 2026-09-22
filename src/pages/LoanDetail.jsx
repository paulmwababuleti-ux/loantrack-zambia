import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getSignedUrl, supabase } from '../lib/supabase';
import { Avatar, Badge, Banner, EmptyState, SignedImage, Spinner } from '../components/ui';
import { fmtDate, frequencyLabel, frequencyPer, money } from '../lib/format';

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
  const [loan, setLoan] = useState(undefined);

  const load = useCallback(async () => {
    const { data } = await supabase.from('loans').select('*, clients(*)').eq('id', id).maybeSingle();
    setLoan(data ?? null);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loan === undefined) return <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>;
  if (loan === null) return <EmptyState title="Loan not found" />;

  const c = loan.clients;

  return (
    <div className="space-y-5 pb-4">
      <Link to="/loans" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 active:text-stone-800"><ArrowLeft size={18} /> Loans</Link>

      {location.state?.created && (
        <Banner type="ok">Loan saved. It is Pending approval until the Master Admin approves it.</Banner>
      )}

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
      </div>

      <div className="card overflow-hidden">
        <div className="bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-800">Loan breakdown</div>
        <dl className="divide-y divide-stone-100 px-5 text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Amount</dt><dd className="font-semibold">{money(loan.amount)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Repayments</dt><dd className="font-semibold">{loan.num_repayments}, {frequencyLabel(loan.repayment_frequency).toLowerCase()}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Interest rate</dt><dd className="font-semibold">{Number(loan.interest_rate_per_period)}% per {frequencyPer(loan.repayment_frequency)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Total interest</dt><dd className="font-semibold">{money(loan.total_interest)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Total repayable</dt><dd className="font-semibold">{money(loan.total_repayable)}</dd></div>
          <div className="flex justify-between bg-brand-700 px-5 py-3 -mx-5 text-white"><dt>Each repayment</dt><dd className="font-display text-lg font-bold">{money(loan.installment_amount)}</dd></div>
        </dl>
      </div>

      {loan.status !== 'pending' && (
        <div className="card p-5 text-sm">
          <h2 className="mb-2 text-lg font-semibold">Dates</h2>
          <dl className="space-y-1.5">
            <div><dt className="inline text-stone-500">Start date: </dt><dd className="inline font-medium">{fmtDate(loan.start_date)}</dd></div>
            <div><dt className="inline text-stone-500">Expected payback: </dt><dd className="inline font-medium">{fmtDate(loan.expected_pay_date)}</dd></div>
          </dl>
          {loan.status === 'rejected' && loan.rejection_reason && (
            <p className="mt-2 rounded-lg bg-stone-50 p-3 text-stone-700"><b>Reason:</b> {loan.rejection_reason}</p>
          )}
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-2 text-lg font-semibold">Collateral</h2>
        <p className="whitespace-pre-line text-[15px] text-stone-700">{loan.collateral_description}</p>
        {loan.collateral_images?.length > 0 && (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {loan.collateral_images.map((path) => <CollateralPhoto key={path} path={path} />)}
          </div>
        )}
      </div>

      {loan.status === 'pending' && (
        <Banner type="info">Approving and rejecting loans is built in Phase 4.</Banner>
      )}

      <p className="text-center text-xs text-stone-400">Created {fmtDate(loan.created_at)}</p>
    </div>
  );
}
