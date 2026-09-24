import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { createAdmin, generatePassword } from '../lib/admins';
import { Banner, Sheet, Spinner } from './ui';

/** Creates a new staff account. The role dropdown only offers roles the current viewer is allowed to create. */
export default function AddAdminSheet({ isSuper, defaultRole = 'loan_officer', onClose, onCreated }) {
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [role, setRole] = useState(defaultRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await createAdmin({ full_name: full_name.trim(), email: email.trim(), password, role });
      onCreated(`${full_name.trim()} can now sign in. Share this password with them privately: ${password}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={defaultRole === 'loan_officer' ? 'Add officer' : 'Add admin'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="admin-name">Full name</label>
          <input id="admin-name" className="input" required value={full_name} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="admin-email">Email</label>
          <input id="admin-email" className="input" type="email" required autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="mt-1 text-xs text-stone-500">They sign in with this. It also receives calendar invites and reminder emails.</p>
        </div>
        <div>
          <label className="label" htmlFor="admin-role">Role</label>
          <select id="admin-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="loan_officer">Loan Officer</option>
            {isSuper && <option value="master_admin">Master Admin</option>}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="admin-password">Temporary password</label>
          <div className="flex gap-2">
            <input id="admin-password" className="input" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" aria-label="Generate a new password" onClick={() => setPassword(generatePassword())} className="btn-ghost !w-14 shrink-0 px-0">
              <RefreshCw size={18} />
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-500">At least 8 characters. Share it with them privately - it's shown once more after saving.</p>
        </div>

        {error && <Banner type="error">{error}</Banner>}

        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Create account'}</button>
      </form>
    </Sheet>
  );
}
