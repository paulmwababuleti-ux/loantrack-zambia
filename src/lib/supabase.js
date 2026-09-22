import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configMissing = !url || !key;

export const supabase = createClient(url || 'http://localhost', key || 'missing');

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'LoanTrack';

/** Shrinks a phone photo (max 1280px, JPEG 80%) so the free 1 GB storage bucket lasts a long time. */
export async function compressImage(file, max = 1280, quality = 0.8) {
  if (!file.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // if compression fails for any reason, upload the original rather than block the save
  }
}

/** Uploads one photo into a private bucket and returns its storage path. */
export async function uploadPhoto(bucket, folder, file) {
  const small = await compressImage(file);
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, small, { contentType: small.type || 'image/jpeg' });
  if (error) throw error;
  return path;
}

/** Uploads one PDF as-is (PDFs aren't compressed the way photos are) and returns its storage path. */
export async function uploadDocument(bucket, folder, file) {
  const path = `${folder}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  return path;
}

/** Short-lived signed link for a private photo, cached in memory for the session. */
const signedUrlCache = new Map();
export async function getSignedUrl(bucket, path, seconds = 6 * 3600) {
  if (!path) return null;
  const key = `${bucket}/${path}`;
  if (signedUrlCache.has(key)) return signedUrlCache.get(key);
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (data?.signedUrl) signedUrlCache.set(key, data.signedUrl);
  return data?.signedUrl || null;
}
