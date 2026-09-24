export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export const preflight = () => new Response('ok', { headers: corsHeaders });

// deno-lint-ignore no-explicit-any
export const errorResponse = (e: any) =>
  json({ error: e?.message ?? 'Something went wrong' }, typeof e?.status === 'number' ? e.status : 500);
