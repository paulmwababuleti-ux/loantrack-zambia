import { supabase, APP_NAME } from './supabase';

const LAST_BACKUP_KEY = 'loantrack:lastBackupAt';
const REMINDER_DAYS = 14;

export function getLastBackup() {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

/** True once it's been 2+ weeks since the last backup, or none has ever been made. */
export function needsBackupReminder() {
  const last = getLastBackup();
  if (!last) return true;
  const days = (Date.now() - new Date(last).getTime()) / 86400000;
  return days >= REMINDER_DAYS;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads every client, loan and payment as one file, and remembers when this ran
 * (so the app can remind you again in 2 weeks). Photos and PDFs are not included in
 * this file - only the records themselves.
 */
export async function runBackup() {
  const [clients, loans, payments] = await Promise.all([
    supabase.from('clients').select('*').order('created_at'),
    supabase.from('loans').select('*').order('created_at'),
    supabase.from('payments').select('*').order('created_at'),
  ]);
  const firstError = clients.error || loans.error || payments.error;
  if (firstError) throw new Error(firstError.message);

  const payload = {
    app: APP_NAME,
    generated_at: new Date().toISOString(),
    tables: {
      clients: clients.data || [],
      loans: loans.data || [],
      payments: payments.data || [],
    },
  };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`loantrack-backup-${stamp}.json`, payload);
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());

  return {
    clients: payload.tables.clients.length,
    loans: payload.tables.loans.length,
    payments: payload.tables.payments.length,
  };
}
