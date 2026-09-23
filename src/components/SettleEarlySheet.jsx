import { useState } from 'react';
import { settleLoanEarly } from '../lib/loans';
import { frequencyPer, money, previewEarlySettlement } from '../lib/format';
import { Banner, Sheet, Spinner } from './ui';

/**
 * Master Admin only. Shows what an early settlement would charge - interest
 * for only the repayment periods that have elapsed so far - before confirming.
 */
export default function SettleEarlySheet({ loan, onClose, onSettled }) {
  const preview = previewEarlySettlement(loan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const updated = await settleLoanEarly(loan.id);
      onSettled(updated);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!preview) {
    return (
      <Sheet title="Settle early" onClose={onClose}>
        <Banner type="error">This loan can't be settled early right now.</Banner>
      </Sheet>
    );
  }

  return (
    <Sheet title="Settle this loan early" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed text-stone-600">
          Charges interest for the {preview.elapsedPeriods} repayment period{preview.elapsedPeriods === 1 ? '' : 's'} that
          {' '}have passed since the loan started (per {frequencyPer(loan.repayment_frequency)}), instead of the original {loan.num_repayments}.
        </p>

        <dl className="card divide-y divide-stone-100 px-4 text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-stone-500">Originally agreed total</dt><dd className="text-stone-500 line-through">{money(loan.total_repayable)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">New interest ({preview.elapsedPeriods}x)</dt><dd className="font-semibold">{money(preview.newInterest)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">New total</dt><dd className="font-semibold">{money(preview.newTotal)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-stone-600">Already paid</dt><dd className="font-semibold">{money(loan.amount_paid)}</dd></div>
          <div className="flex justify-between bg-brand-700 px-4 py-3 -mx-4 text-white"><dt>Remaining to collect</dt><dd className="font-display text-lg font-bold">{money(preview.remaining)}</dd></div>
        </dl>

        {error && <Banner type="error">{error}</Banner>}

        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" onClick={confirm} disabled={busy}>{busy ? <Spinner /> : 'Apply settlement'}</button>
        </div>
      </div>
    </Sheet>
  );
}
