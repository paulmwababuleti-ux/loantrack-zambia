import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Service-role client: bypasses row security. Only used after the caller is verified. */
export const adminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

/** Verifies the caller's login token and that they are an active admin (optionally Master Admin). */
export async function requireAdmin(req: Request, superOnly = false) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) throw new HttpError(401, 'Not signed in');

  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Not signed in');

  const { data: me } = await db.from('admins').select('*').eq('id', data.user.id).maybeSingle();
  if (!me || !me.is_active) throw new HttpError(403, 'This account is not allowed to do that');
  if (superOnly && me.role !== 'master_admin' && me.role !== 'super_admin') throw new HttpError(403, 'Only the Master Admin can do that');
  return { me, db };
}

export const money = (n: number | string) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Today's date in Zambia (UTC+2, no daylight saving) as YYYY-MM-DD */
export const lusakaDate = (offsetDays = 0) =>
  new Date(Date.now() + 2 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
