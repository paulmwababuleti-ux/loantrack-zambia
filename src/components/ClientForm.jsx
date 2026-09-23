import { useRef, useState } from 'react';
import { Camera, FileText, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { supabase, uploadDocument, uploadPhoto } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Avatar, Banner, SignedImage, Spinner } from './ui';

/** One compact front/back capture box: shows the photo once chosen, or Take photo / Gallery buttons. */
function CaptureBox({ label, preview, existingPath, onPick }) {
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);
  const filled = preview || existingPath;

  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-stone-600">{label}</div>
      {filled ? (
        <div className="relative h-28 w-full overflow-hidden rounded-xl border border-stone-200">
          {preview ? (
            <img src={preview} alt={label} className="h-full w-full object-cover" />
          ) : (
            <SignedImage bucket="client-photos" path={existingPath} alt={label} className="h-full w-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => galleryInput.current.click()}
            className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white active:bg-black/75"
          >
            <Pencil size={12} /> Change
          </button>
        </div>
      ) : (
        <div className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 text-stone-400">
          <div className="flex gap-1.5">
            <button type="button" aria-label={`Take photo of ${label}`} onClick={() => cameraInput.current.click()} className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white active:bg-stone-100">
              <Camera size={18} />
            </button>
            <button type="button" aria-label={`Choose ${label} from gallery`} onClick={() => galleryInput.current.click()} className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white active:bg-stone-100">
              <ImagePlus size={18} />
            </button>
          </div>
        </div>
      )}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={onPick} />
    </div>
  );
}

/** Add or edit a client. Single column, large fields, camera-first photo capture. */
export default function ClientForm({ initial, onSaved, onCancel }) {
  const { admin } = useAuth();
  const isEdit = !!initial;
  const [full_name, setFullName] = useState(initial?.full_name || '');
  const [nrc_number, setNrcNumber] = useState(initial?.nrc_number || '');
  const [phone1, setPhone1] = useState(initial?.phone1 || '');
  const [phone2, setPhone2] = useState(initial?.phone2 || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [address, setAddress] = useState(initial?.address || '');

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);

  const [frontFile, setFrontFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [backPreview, setBackPreview] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfRemoved, setPdfRemoved] = useState(false);
  const [showPdf, setShowPdf] = useState(!!initial?.nrc_pdf_path);
  const pdfInput = useRef(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pick(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
    e.target.value = '';
  }
  function pickFront(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFrontFile(picked);
    setFrontPreview(URL.createObjectURL(picked));
    e.target.value = '';
  }
  function pickBack(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setBackFile(picked);
    setBackPreview(URL.createObjectURL(picked));
    e.target.value = '';
  }
  function pickPdf(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.type !== 'application/pdf') { setError('Please choose a PDF file.'); return; }
    setPdfFile(picked);
    setPdfRemoved(false);
    e.target.value = '';
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let photo_url = initial?.photo_url || null;
      if (file) photo_url = await uploadPhoto('client-photos', 'clients', file);

      let nrc_photo_front_url = initial?.nrc_photo_front_url || null;
      if (frontFile) nrc_photo_front_url = await uploadPhoto('client-photos', 'nrc', frontFile);

      let nrc_photo_back_url = initial?.nrc_photo_back_url || null;
      if (backFile) nrc_photo_back_url = await uploadPhoto('client-photos', 'nrc', backFile);

      let nrc_pdf_path = pdfRemoved ? null : initial?.nrc_pdf_path || null;
      if (pdfFile) nrc_pdf_path = await uploadDocument('client-documents', 'nrc', pdfFile);

      const payload = {
        full_name: full_name.trim(),
        nrc_number: nrc_number.trim(),
        phone1: phone1.trim(),
        phone2: phone2.trim() || null,
        email: email.trim() || null,
        address: address.trim(),
        photo_url,
        nrc_photo_front_url,
        nrc_photo_back_url,
        nrc_pdf_path,
      };
      const query = isEdit
        ? supabase.from('clients').update(payload).eq('id', initial.id)
        : supabase.from('clients').insert({ ...payload, created_by: admin.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      onSaved(data);
    } catch (err) {
      setError(err.code === '23505' ? 'A client with this NRC number already exists.' : err.message);
      setBusy(false);
    }
  }

  const pdfName = pdfFile?.name || (!pdfRemoved && initial?.nrc_pdf_path ? 'NRC.pdf (attached)' : null);

  return (
    <form onSubmit={submit} className="space-y-5 pb-4">
      {/* Profile photo */}
      <div className="flex flex-col items-center gap-3">
        {preview ? (
          <img src={preview} alt="" className="h-28 w-28 rounded-full object-cover" />
        ) : (
          <Avatar name={full_name} path={initial?.photo_url} size={112} />
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => cameraInput.current.click()}>
            <Camera size={20} /> Take photo
          </button>
          <button type="button" className="btn-ghost" onClick={() => galleryInput.current.click()}>
            <ImagePlus size={20} /> Gallery
          </button>
        </div>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>

      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input id="full_name" className="input" required autoComplete="off" value={full_name} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="nrc">NRC number</label>
        <input id="nrc" className="input" required inputMode="numeric" placeholder="123456/78/1" value={nrc_number} onChange={(e) => setNrcNumber(e.target.value)} />
      </div>

      {/* NRC photos: front and back */}
      <div>
        <span className="label">NRC photo (optional)</span>
        <div className="grid grid-cols-2 gap-3">
          <CaptureBox label="Front" preview={frontPreview} existingPath={initial?.nrc_photo_front_url} onPick={pickFront} />
          <CaptureBox label="Back" preview={backPreview} existingPath={initial?.nrc_photo_back_url} onPick={pickBack} />
        </div>

        {!showPdf ? (
          <button type="button" onClick={() => setShowPdf(true)} className="mt-2 text-sm font-medium text-brand-700 underline underline-offset-2">
            Camera not working? Attach a PDF instead
          </button>
        ) : (
          <div className="mt-3 rounded-xl border border-stone-200 p-3">
            <div className="mb-2 text-sm font-medium text-stone-600">NRC as a PDF</div>
            {pdfName ? (
              <div className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2.5">
                <FileText size={20} className="shrink-0 text-brand-700" />
                <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{pdfName}</span>
                <button
                  type="button" aria-label="Remove PDF"
                  onClick={() => { setPdfFile(null); setPdfRemoved(true); }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 active:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button type="button" className="btn-ghost w-full" onClick={() => pdfInput.current.click()}>
                <FileText size={18} /> Choose PDF file
              </button>
            )}
            <input ref={pdfInput} type="file" accept="application/pdf" className="hidden" onChange={pickPdf} />
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="phone1">Phone number</label>
        <input id="phone1" className="input" type="tel" inputMode="tel" required placeholder="0977 123 456" value={phone1} onChange={(e) => setPhone1(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="phone2">Second phone (optional)</label>
        <input id="phone2" className="input" type="tel" inputMode="tel" value={phone2} onChange={(e) => setPhone2(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email (optional)</label>
        <input id="email" className="input" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="address">Physical address</label>
        <textarea id="address" className="input h-auto py-3" rows={3} required value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>

      {error && <Banner type="error">{error}</Banner>}

      <div className="flex gap-3 pt-1">
        {onCancel && <button type="button" className="btn-ghost flex-1" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary flex-1" disabled={busy}>
          {busy ? <Spinner /> : isEdit ? 'Save changes' : 'Save client'}
        </button>
      </div>
    </form>
  );
}
