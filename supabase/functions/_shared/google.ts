// Google Calendar helpers. Uses ONE connected Google account (OAuth refresh token)
// that owns the events and invites every admin as a guest.

const env = (k: string) => Deno.env.get(k) ?? '';

export const googleConfigured = () =>
  !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REFRESH_TOKEN'));

const calendarId = () => encodeURIComponent(env('GOOGLE_CALENDAR_ID') || 'primary');
const sendUpdates = () => (env('CALENDAR_SEND_INVITES') === 'none' ? 'none' : 'all');

export async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: env('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google sign-in failed: ' + (data.error_description || data.error));
  return data.access_token;
}

const addDays = (date: string, n: number) => {
  const t = new Date(date + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export async function createAllDayEvent(
  token: string,
  ev: { summary: string; description: string; date: string; attendees: { email: string }[] },
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId()}/events?sendUpdates=${sendUpdates()}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: ev.summary,
        description: ev.description,
        start: { date: ev.date },
        end: { date: addDays(ev.date, 1) },
        attendees: ev.attendees,
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 900 }, { method: 'email', minutes: 900 }] },
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error('Calendar error: ' + (data?.error?.message ?? res.status));
  return data.id;
}
