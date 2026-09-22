import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configMissing = !url || !key;

export const supabase = createClient(url || 'http://localhost', key || 'missing');

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'LoanTrack';
