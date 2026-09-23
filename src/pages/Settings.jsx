import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generatePassword, removeAdmin, resetAdminPassword, updateAdmin } from '../lib/admins';
import { loadCompanySettings, saveCompanyAssets } from '../lib/settings';
import { Banner, RoleBadge, SignedImage, Spinner } from '../components/ui';
import AddAdminSheet from '../components/AddAdminSheet';
import { fmtDate } from '../lib/format';

const ROLE_OPTIONS = [
  { value: 'loan_officer', label: 'Loan Officer' },
  { value: 'master_admin', label: 'Master Admin' },
];

function AssetBox({ label, path, onPick }) {
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-stone-600">{label}</div>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
          {path ? <SignedImage bucket="company-assets" path={path} alt={label} className="h-full w-full object-contain" /> : <span className="text-xs text-stone-400">None yet</span>}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label={`Take photo for ${label}`} onClick={() => cameraInput.current.click()} className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white active:bg-stone-100">
            <Camera size={18} />
          </button>
          <button type="button" aria-label={`Choose ${label} from gallery`} onClick={() => galleryInput.current.click()} className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 bg-white active:bg-stone-100">
            <ImagePlus size={18} />
          </button>
        </div>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={onPick} />
    </div>
  );
}

export default function Settings() {
  const { admin, isSuper } = useAuth();
  const [settings, setSettings] = useState(undefined);
  const [logoFile, setLogoFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandBanner, setBrandBanner] = useState('');

  const [admins, setAdmins] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [listBanner, setListBanner] = useState(null); // { type, text }

  const canManage = (targetRole) => (isSuper ? targetRole !== 'super_admin' : targetRole === 'loan_officer');

  const loadAll = async () => {
    const [s, { data: a }] = await Promise.all([
      loadCompanySettings(),
      supabase.from('admins').select('*').order('created_at'),
    ]);
    setSettings(s);
    setAdmins(a || []);
  };

  useEffect(() => { loadAll(); }, []);

  async function saveBranding(e) {
    e.preventDefault();
    if (!logoFile && !signatureFile) return;
    setSavingBrand(true);
    setBrandBanner('');
    try {
      const updated = await saveCompanyAssets({ logoFile, signatureFile });
      setSettings(updated);
      setLogoFile(null);
      setSignatureFile(null);
      setBrandBanner('Saved.');
    } catch (err) {
      setBrandBanner(err.message);
    } finally {
      setSavingBrand(false);
    }
  }

  async function run(action, id, okText) {
    setBusyId(id);
    setListBanner(null);
    try {
      await action();
      setListBanner({ type: 'ok', text: okText });
      await loadAll();
    } catch (err) {
      setListBanner({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  function resetPassword(a) {
    const password = generatePassword();
    if (!window.confirm(`Reset ${a.full_name}'s password to a new random one?\n\nNew password: ${password}\n\nMake sure you can share this with them before continuing.`)) return;
    run(() => resetAdminPassword(a.id, password), a.id, `Password reset for ${a.full_name}. New password: ${password}`);
  }

  if (settings === undefined || admins === null) return <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>;

  return (
    <div className="space-y-6 pb-4">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Company branding</h2>
        <form onSubmit={saveBranding} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <AssetBox
              label="Logo"
              path={logoFile ? null : settings?.logo_path}
              onPick={(e) => { const f = e.target.files?.[0]; if (f) setLogoFile(f); e.target.value = ''; }}
            />
            <AssetBox
              label="Signature"
              path={signatureFile ? null : settings?.signature_path}
              onPick={(e) => { const f = e.target.files?.[0]; if (f) setSignatureFile(f); e.target.value = ''; }}
            />
          </div>
          {(logoFile || signatureFile) && (
            <p className="text-xs text-stone-500">
              {logoFile && `New logo selected: ${logoFile.name}. `}
              {signatureFile && `New signature selected: ${signatureFile.name}.`}
            </p>
          )}
          {brandBanner && <Banner type={brandBanner === 'Saved.' ? 'ok' : 'error'}>{brandBanner}</Banner>}
          <button className="btn-primary w-full" disabled={savingBrand || (!logoFile && !signatureFile)}>
            {savingBrand ? <Spinner /> : <><Check size={18} /> Save branding</>}
          </button>
        </form>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Staff accounts</h2>
          <button className="btn-ghost btn-sm" onClick={() => setAdding(true)}><UserPlus size={16} /> Add</button>
        </div>
        {listBanner && <div className="mb-2"><Banner type={listBanner.type}>{listBanner.text}</Banner></div>}
        <div className="card divide-y divide-stone-100">
          {admins.map((a) => {
            const self = a.id === admin.id;
            const manageable = canManage(a.role) && !self;
            return (
              <div key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-stone-900">{a.full_name}</span>
                      {self && <span className="text-xs text-stone-400">(you)</span>}
                      {!a.is_active && <span className="text-xs text-red-600">(inactive)</span>}
                    </div>
                    <div className="truncate text-sm text-stone-500">{a.email}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <RoleBadge role={a.role} />
                      <span className="text-xs text-stone-400">added {fmtDate(a.created_at)}</span>
                    </div>
                  </div>
                </div>

                {manageable && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className="input !h-10 !w-auto py-0 text-xs"
                      value={a.role}
                      disabled={busyId === a.id}
                      onChange={(e) => run(() => updateAdmin(a.id, { role: e.target.value }), a.id, 'Role updated.')}
                    >
                      {ROLE_OPTIONS.filter((o) => isSuper || o.value === 'loan_officer').map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      className="btn-ghost btn-sm"
                      disabled={busyId === a.id}
                      onClick={() => run(() => updateAdmin(a.id, { is_active: !a.is_active }), a.id, a.is_active ? 'Account deactivated.' : 'Account re-activated.')}
                    >
                      {a.is_active ? 'Deactivate' : 'Re-activate'}
                    </button>
                    <button className="btn-ghost btn-sm" disabled={busyId === a.id} onClick={() => resetPassword(a)}><KeyRound size={14} /> Reset password</button>
                    <button
                      className="btn-ghost btn-sm text-red-700"
                      disabled={busyId === a.id}
                      onClick={() => window.confirm(`Remove ${a.full_name}? They will no longer be able to sign in.`) && run(() => removeAdmin(a.id), a.id, 'Account removed.')}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {adding && (
        <AddAdminSheet
          isSuper={isSuper}
          onClose={() => setAdding(false)}
          onCreated={(msg) => { setAdding(false); setListBanner({ type: 'ok', text: msg }); loadAll(); }}
        />
      )}
    </div>
  );
}
