/* Start Google OAuth. hd= asks Google to show only Interview Kickstart accounts.
   hd is a hint, not a control - the callback re-checks the domain server-side. */
export const config = { runtime: 'edge' };

const notConfigured = () => new Response(
  JSON.stringify({ ok: false, error: 'NOT_CONFIGURED',
    detail: 'Set SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ALLOWED_DOMAINS in Vercel, then redeploy.' }),
  { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async function handler(req: Request) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.SESSION_SECRET) return notConfigured();
  const url = new URL(req.url);
  const next = url.searchParams.get('next') || '/';
  const state = crypto.randomUUID();

  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
  auth.searchParams.set('redirect_uri', `${url.origin}/api/auth/callback`);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'openid email profile');
  auth.searchParams.set('hd', (process.env.ALLOWED_DOMAINS || '').split(',')[0].trim());
  auth.searchParams.set('state', state);
  // If they already have a Google session, this returns without a prompt.
  // That is what makes the second app feel like SSO.
  auth.searchParams.set('prompt', 'select_account');

  const jar = [
    `ik_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `ik_next=${encodeURIComponent(next)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  ];
  const h = new Headers({ Location: auth.toString() });
  jar.forEach(c => h.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers: h });
}
