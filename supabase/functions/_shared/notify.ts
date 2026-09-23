const env = (k: string) => Deno.env.get(k) ?? '';

export async function sendEmail(to: string[], subject: string, html: string) {
  if (!env('RESEND_API_KEY')) return { sent: false, reason: 'RESEND_API_KEY not set' };
  if (!to.length) return { sent: false, reason: 'no recipients' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM') || 'LoanTrack <onboarding@resend.dev>', to, subject, html }),
  });
  const body = await res.text();
  return { sent: res.ok, reason: res.ok ? '' : body };
}
