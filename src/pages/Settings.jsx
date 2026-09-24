import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generatePassword, removeAdmin, resetAdminPassword, updateAdmin } from '../lib/admins';
import { loadCompanySettings, saveCompanyAssets } from '../lib/settings';
import { Banner, EmptyState, RoleBadge, SignedImage, Spinner, Toggle } from '../components/ui';
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

function AdminRow({ a, self, manageable, isSuper, busy, onRoleChange, onToggleActive, onResetPassword, onRemove }) {
  return (
    <div className="p-4">
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
          <select className="input !h-10 !w-auto py-0 text-xs" value={a.role} disabled={busy} onChange={(e) => onRoleChange(e.target.value)}>
            {ROLE_OPTIONS.filter((o) => isSuper || o.value === 'loan_officer').map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="btn-ghost btn-sm" disabled={busy} onClick={onToggleActive}>{a.is_active ? 'Deactivate' : 'Re-activate'}</button>
          <button className="btn-ghost btn-sm" disabled={busy} onClick={onResetPassword}><KeyRound size={14} /> Reset password</button>
          <button className="btn-ghost btn-sm text-red-700" disabled={busy} onClick={onRemove}><Trash2 size={14} /> Remove</button>
        </div>
      )}
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
  const [emailsOn, setEmailsOn] = useState(admin.receives_email_notifications);
  const [savingEmailPref, setSavingEmailPref] = useState(false);

  const [admins, setAdmins] = useState(null);
  const [addingRole, setAddingRole] = useState(null); // 'master_admin' | 'loan_officer' | null
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

  async function toggleEmails(next) {
    setEmailsOn(next);
    setSavingEmailPref(true);
    const { error } = await supabase.from('admins').update({ receives_email_notifications: next }).eq('id', admin.id);
    setSavingEmailPref(false);
    if (error) setEmailsOn(!next); // revert on failure
  }

  if (settings === undefined || admins === null) return <div className="flex justify-center py-16 text-brand-700"><Spinner size={28} /></div>;

  const adminStaff = admins.filter((a) => a.role === 'super_admin' || a.role === 'master_admin');
  const officers = admins.filter((a) => a.role === 'loan_officer');

  const rowProps = (a) => ({
    a,
    self: a.id === admin.id,
    manageable: canManage(a.role) && a.id !== admin.id,
    isSuper,
    busy: busyId === a.id,
    onRoleChange: (role) => run(() => updateAdmin(a.id, { role }), a.id, 'Role updated.'),
    onToggleActive: () => run(() => updateAdmin(a.id, { is_active: !a.is_active }), a.id, a.is_active ? 'Account deactivated.' : 'Account re-activated.'),
    onResetPassword: () => resetPassword(a),
    onRemove: () => window.confirm(`Remove ${a.full_name}? They will no longer be able to sign in.`) && run(() => removeAdmin(a.id), a.id, 'Account removed.'),
  });

  return (
    <div className="space-y-6 pb-4">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-semibold">Your account</h2>
        <Toggle
          checked={emailsOn}
          onChange={toggleEmails}
          disabled={savingEmailPref}
          label="Email notifications"
          hint="Pending loans, and daily reminders, sent to you by email."
        />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Company Settings</h2>
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

      {listBanner && <Banner type={listBanner.type}>{listBanner.text}</Banner>}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Admin Staff</h2>
          {isSuper && <button className="btn-ghost btn-sm" onClick={() => setAddingRole('master_admin')}><UserPlus size={16} /> Add</button>}
        </div>
        <div className="card divide-y divide-stone-100">
          {adminStaff.length === 0 ? <EmptyState title="No admin staff yet" /> : adminStaff.map((a) => <AdminRow key={a.id} {...rowProps(a)} />)}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Non-Admin Staff (Officers)</h2>
          <button className="btn-ghost btn-sm" onClick={() => setAddingRole('loan_officer')}><UserPlus size={16} /> Add</button>
        </div>
        <div className="card divide-y divide-stone-100">
          {officers.length === 0 ? <EmptyState title="No officers yet" /> : officers.map((a) => <AdminRow key={a.id} {...rowProps(a)} />)}
        </div>
      </section>

      {addingRole && (
        <AddAdminSheet
          isSuper={isSuper}
          defaultRole={addingRole}
          onClose={() => setAddingRole(null)}
          onCreated={(msg) => { setAddingRole(null); setListBanner({ type: 'ok', text: msg }); loadAll(); }}
        />
      )}
    </div>
  );
}
