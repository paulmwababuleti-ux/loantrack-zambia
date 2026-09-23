import { useState } from 'react';
import { recordPayment } from '../lib/loans';
import { balance, money } from '../lib/format';
import { Banner, Sheet, Spinner } from './ui';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

/** A sheet for recording a full or partial payment against an approved loan. */
export default function PaymentSheet({ loan, onClose, onRecorded }) {
  const owed = balance(loan);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const n = Number(amount);
    if (!n || n <= 0) return setError('Enter an amount greater than zero.');
    if (n > owed) return setError(`That is more than the outstanding balance (${money(owed)}).`);
    setBusy(true);
    setError('');
    try {
      const payment = await recordPayment(loan.id, { amount: n, method, note });
      onRecorded(payment);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Record payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
          <span className="text-stone-500">Outstanding balance: </span>
          <span className="font-semibold text-stone-900">{money(owed)}</span>
        </div>

        <div>
          <label className="label" htmlFor="pay-amount">Amount received</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-stone-400">K</span>
            <input
              id="pay-amount" className="input pl-9 text-xl font-semibold" type="number" inputMode="decimal"
              min="0.01" max={owed} step="0.01" placeholder="0.00" autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <button type="button" onClick={() => setAmount(String(owed))} className="mt-1.5 text-sm font-medium text-brand-700 underline underline-offset-2">
            Use full balance ({money(owed)})
          </button>
        </div>

        <div>
          <label className="label" htmlFor="pay-method">Paid by</label>
          <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="pay-note">Note (optional)</label>
          <input id="pay-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {error && <Banner type="error">{error}</Banner>}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner /> : `Record ${amount ? money(amount) : 'payment'}`}
        </button>
      </form>
    </Sheet>
  );
}
