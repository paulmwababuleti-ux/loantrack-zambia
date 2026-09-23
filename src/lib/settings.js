import { supabase, uploadPhoto } from './supabase';

export async function loadCompanySettings() {
  const { data, error } = await supabase.from('company_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Uploads a new logo and/or signature (pass only what changed) and saves the paths. */
export async function saveCompanyAssets({ logoFile, signatureFile }) {
  const patch = {};
  if (logoFile) patch.logo_path = await uploadPhoto('company-assets', 'branding', logoFile);
  if (signatureFile) patch.signature_path = await uploadPhoto('company-assets', 'branding', signatureFile);
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await supabase.from('company_settings').update(patch).eq('id', true).select().single();
  if (error) throw new Error(error.message);
  return data;
}
