// Creates, updates, removes and resets passwords for admin accounts.
// Role hierarchy: super_admin > master_admin > loan_officer.
//   - Master Admin can create/manage Loan Officer accounts only.
//   - Super Admin can additionally create/manage Master Admin accounts.
//   - Nobody can create a Super Admin account here - that's a one-time
//     SQL step, done by whoever set up the project.
import { errorResponse, json, preflight } from '../_shared/cors.ts';
import { HttpError, requireAdmin } from '../_shared/auth.ts';

const CREATABLE_ROLES = ['master_admin', 'loan_officer'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { me, db } = await requireAdmin(req, true); // Master Admin or Super Admin
    const body = await req.json();

    // Master Admin may only touch Loan Officer accounts; Super Admin may touch
    // Loan Officer and Master Admin accounts (never another Super Admin here).
    const canManage = (targetRole: string) =>
      me.role === 'super_admin' ? targetRole !== 'super_admin' : targetRole === 'loan_officer';

    const log = (action: string, id: string | null, details: Record<string, unknown>) =>
      db.from('activity_logs').insert({
        admin_id: me.id, admin_name: me.full_name, action, entity_type: 'admins', entity_id: id, details,
      });

    const otherActiveSeniors = async (excludeId: string) => {
      const { count } = await db.from('admins').select('id', { count: 'exact', head: true })
        .in('role', ['master_admin', 'super_admin']).eq('is_active', true).neq('id', excludeId);
      return count ?? 0;
    };

    const getTarget = async () => {
      const { data } = await db.from('admins').select('*').eq('id', body.id).maybeSingle();
      if (!data) throw new HttpError(404, 'Admin not found');
      return data;
    };

    switch (body.action) {
      case 'create': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const full_name = String(body.full_name ?? '').trim();
        const role = body.role;
        const password = String(body.password ?? '');
        if (!email.includes('@') || !full_name) throw new HttpError(400, 'Enter a name and a valid email');
        if (!CREATABLE_ROLES.includes(role)) throw new HttpError(400, 'Choose a role');
        if (!canManage(role)) throw new HttpError(403, 'Only the Super Admin can create a Master Admin account');
        if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

        const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !created.user) throw new HttpError(400, error?.message ?? 'Could not create the account');
        const { error: insertError } = await db.from('admins').insert({ id: created.user.id, email, full_name, role });
        if (insertError) {
          await db.auth.admin.deleteUser(created.user.id);
          throw new HttpError(400, insertError.message);
        }
        await log('admins_insert', created.user.id, { email, role, name: full_name });
        return json({ ok: true });
      }

      case 'update': {
        const target = await getTarget();
        if (!canManage(target.role)) throw new HttpError(403, 'You cannot manage this account');
        if (target.id === me.id) throw new HttpError(400, 'You cannot change your own role or deactivate your own account');

        const patch: Record<string, unknown> = {};
        if (typeof body.full_name === 'string' && body.full_name.trim()) patch.full_name = body.full_name.trim();
        if (body.role !== undefined) {
          if (!CREATABLE_ROLES.includes(body.role) || !canManage(body.role)) throw new HttpError(400, 'Invalid role');
          patch.role = body.role;
        }
        if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

        const losesSenior = ['master_admin', 'super_admin'].includes(target.role) && target.is_active &&
          ((patch.role && !['master_admin', 'super_admin'].includes(patch.role as string)) || patch.is_active === false);
        if (losesSenior && (await otherActiveSeniors(target.id)) < 1) {
          throw new HttpError(400, 'There must always be at least one active Master Admin or Super Admin');
        }

        const { error } = await db.from('admins').update(patch).eq('id', target.id);
        if (error) throw new HttpError(400, error.message);
        if (typeof body.is_active === 'boolean') {
          await db.auth.admin.updateUserById(target.id, { ban_duration: body.is_active ? 'none' : '876000h' });
        }
        await log('admins_update', target.id, { email: target.email, changes: patch });
        return json({ ok: true });
      }

      case 'remove': {
        const target = await getTarget();
        if (!canManage(target.role)) throw new HttpError(403, 'You cannot manage this account');
        if (target.id === me.id) throw new HttpError(400, 'You cannot remove your own account');
        if (['master_admin', 'super_admin'].includes(target.role) && target.is_active && (await otherActiveSeniors(target.id)) < 1) {
          throw new HttpError(400, 'There must always be at least one active Master Admin or Super Admin');
        }
        await log('admins_delete', target.id, { email: target.email, name: target.full_name });
        const { error } = await db.auth.admin.deleteUser(target.id);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case 'reset_password': {
        const target = await getTarget();
        if (!canManage(target.role)) throw new HttpError(403, 'You cannot manage this account');
        const password = String(body.password ?? '');
        if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
        const { error } = await db.auth.admin.updateUserById(target.id, { password });
        if (error) throw new HttpError(400, error.message);
        await log('admins_password_reset', target.id, { email: target.email });
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    return errorResponse(e);
  }
});
