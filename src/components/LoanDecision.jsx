import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { approveLoan, rejectLoan } from '../lib/loans';
import { Banner, Sheet, Spinner } from './ui';

/**
 * Big, thumb-friendly Approve / Reject buttons for the Master Admin.
 * Only rendered for pending loans; the caller checks the role.
 */
export default function LoanDecision({ loan, onDecided }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  async function approve() {
    if (!window.confirm('Approve this loan?\n\nThe start date will be set to today, and the payback date will be worked out automatically.')) return;
    setBusy(true);
    setError('');
    try {
      const updated = await approveLoan(loan.id);
      onDecided(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReject(e) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setReasonError('Please write a reason (at least 3 characters).');
      return;
    }
    setBusy(true);
    setReasonError('');
    try {
      const updated = await rejectLoan(loan.id, reason);
      setRejecting(false);
      setReason('');
      onDecided(updated);
    } catch (err) {
      setReasonError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Banner type="error">{error}</Banner>}
      <div className="grid grid-cols-2 gap-3">
        <button className="btn-primary" onClick={approve} disabled={busy}>
          {busy ? <Spinner /> : <><Check size={20} /> Approve</>}
        </button>
        <button className="btn-danger" onClick={() => setRejecting(true)} disabled={busy}>
          <X size={20} /> Reject
        </button>
      </div>

      {rejecting && (
        <Sheet title="Reject this loan" onClose={() => { setRejecting(false); setReasonError(''); }}>
          <form onSubmit={submitReject} className="space-y-4">
            <div>
              <label className="label" htmlFor="reason">Reason for rejecting</label>
              <textarea
                id="reason" className="input h-auto py-3" rows={4} autoFocus
                placeholder="e.g. Collateral value too low for the amount requested"
                value={reason} onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {reasonError && <Banner type="error">{reasonError}</Banner>}
            <div className="flex gap-3">
              <button type="button" className="btn-ghost flex-1" onClick={() => setRejecting(false)}>Cancel</button>
              <button className="btn-danger flex-1" disabled={busy}>{busy ? <Spinner /> : 'Reject loan'}</button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
