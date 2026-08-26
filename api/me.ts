/* The cockpit calls this on load. If it answers, the page skips its own
   sign-in gate and uses the real identity instead. */
import { verify } from '../lib/session';
export const config = { runtime: 'edge' };

const notConfigured = () => new Response(
  JSON.stringify({ ok: false, error: 'NOT_CONFIGURED',
    detail: 'Set SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ALLOWED_DOMAINS in Vercel, then redeploy.' }),
  { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async function handler(req: Request) {
  if (!process.env.SESSION_SECRET) return notConfigured();
  const raw = (req.headers.get('cookie') || '').split(';').map(c => c.trim())
    .find(c => c.startsWith('ik_session='))?.split('=').slice(1).join('=');
  const s = await verify(raw, process.env.SESSION_SECRET!);
  if (!s) return new Response(JSON.stringify({ ok: false }), { status: 401,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return new Response(JSON.stringify({ ok: true, email: s.email, name: s.name,
    picture: s.picture, exp: s.exp }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
