import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, ImagePlus, X } from 'lucide-react';
import { supabase, uploadPhoto } from '../lib/supabase';
import ClientPicker from '../components/ClientPicker';
import { Banner, Spinner } from '../components/ui';
import { calcLoan, FREQUENCY_OPTIONS, frequencyPer, money } from '../lib/format';

const MAX_PHOTOS = 6;

export default function LoanForm() {
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [numRepayments, setNumRepayments] = useState('');
  const [rate, setRate] = useState('');
  const [collateralDescription, setCollateralDescription] = useState('');
  const [photos, setPhotos] = useState([]); // [{file, preview}]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const calc = calcLoan(amount, rate, numRepayments);
  const ready = client && Number(amount) > 0 && Number(numRepayments) > 0 && rate !== '' && Number(rate) >= 0 && collateralDescription.trim();

  function addPhotos(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setPhotos((prev) => [...prev, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
    e.target.value = '';
  }
  function removePhoto(i) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const collateral_images = [];
      for (const p of photos) collateral_images.push(await uploadPhoto('collateral-photos', 'collateral', p.file));

      const { data, error } = await supabase.from('loans').insert({
        client_id: client.id,
        amount: Number(amount),
        num_repayments: parseInt(numRepayments, 10),
        repayment_frequency: frequency,
        interest_rate_per_period: Number(rate),
        collateral_description: collateralDescription.trim(),
        collateral_images,
      }).select().single();
      if (error) throw error;
      navigate(`/loans/${data.id}`, { replace: true, state: { created: true } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="pb-4">
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-stone-500 active:text-stone-800">
        <ArrowLeft size={18} /> Back
      </button>
      <h1 className="mb-4 text-3xl font-bold">New loan</h1>

      {/* Live calculation, sticks on screen while you scroll the fields below */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-stone-200 bg-white px-4 py-3 shadow-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Interest</div>
            <div className="text-base font-bold text-stone-900">{money(calc.interest)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Total repayable</div>
            <div className="text-base font-bold text-stone-900">{money(calc.total)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-brand-700">Per repayment</div>
            <div className="text-base font-bold text-brand-700">{money(calc.perRepayment)}</div>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <span className="label">Client</span>
          <ClientPicker value={client} onSelect={setClient} />
        </div>

        <div>
          <label className="label" htmlFor="amount">Amount requested</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-stone-400">K</span>
            <input
              id="amount" className="input pl-9 text-xl font-semibold" type="number" inputMode="decimal"
              min="1" step="0.01" placeholder="0.00" required value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="frequency">Repayment frequency</label>
          <select id="frequency" className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQUENCY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="numRepayments">Number of repayments</label>
            <input id="numRepayments" className="input" type="number" inputMode="numeric" min="1" max="1000" step="1" required value={numRepayments} onChange={(e) => setNumRepayments(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="rate">Interest per {frequencyPer(frequency)} (%)</label>
            <input id="rate" className="input" type="number" inputMode="decimal" min="0" step="0.01" required value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        </div>

        {Number(numRepayments) > 0 && (
          <p className="-mt-2 text-sm text-stone-500">
            {numRepayments} repayment{Number(numRepayments) === 1 ? '' : 's'}, {FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label.toLowerCase()}.
          </p>
        )}

        <div>
          <label className="label" htmlFor="collateral">Collateral description</label>
          <textarea
            id="collateral" className="input h-auto py-3" rows={3} required
            placeholder="e.g. Samsung TV 55 inch, serial number, condition"
            value={collateralDescription} onChange={(e) => setCollateralDescription(e.target.value)}
          />
        </div>

        <div>
          <span className="label">Collateral photos ({photos.length}/{MAX_PHOTOS})</span>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {photos.map((p, i) => (
              <div key={p.preview} className="relative h-24 w-24 shrink-0">
                <img src={p.preview} alt="" className="h-full w-full rounded-xl object-cover" />
                <button
                  type="button" aria-label="Remove photo" onClick={() => removePhoto(i)}
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-stone-800 text-white active:bg-stone-900"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <>
                <label className="flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-stone-400 active:bg-stone-50">
                  <Camera size={22} />
                  <span className="text-xs font-medium">Camera</span>
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={addPhotos} />
                </label>
                <label className="flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-stone-400 active:bg-stone-50">
                  <ImagePlus size={22} />
                  <span className="text-xs font-medium">Gallery</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
                </label>
              </>
            )}
          </div>
        </div>

        {error && <Banner type="error">{error}</Banner>}
        <Banner type="info">This loan will be saved as <b>Pending approval</b>. The Master Admin approves it before it becomes active.</Banner>

        <button className="btn-primary w-full" disabled={!ready || busy}>
          {busy ? <Spinner /> : 'Submit for approval'}
        </button>
      </form>
    </div>
  );
}
