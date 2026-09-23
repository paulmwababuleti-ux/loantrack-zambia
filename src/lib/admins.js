import { callFn } from './supabase';

export const createAdmin = (payload) => callFn('manage-admin', { action: 'create', ...payload });
export const updateAdmin = (id, patch) => callFn('manage-admin', { action: 'update', id, ...patch });
export const removeAdmin = (id) => callFn('manage-admin', { action: 'remove', id });
export const resetAdminPassword = (id, password) => callFn('manage-admin', { action: 'reset_password', id, password });

/** Generates a readable random password, e.g. for a new staff account. */
export function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
