/* The cockpit calls this on load. If it answers, the page skips its own
   sign-in gate and uses the real identity instead. */
import { verify } from '../lib/session';
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const raw = (req.headers.get('cookie') || '').split(';').map(c => c.trim())
    .find(c => c.startsWith('ik_session='))?.split('=').slice(1).join('=');
  const s = await verify(raw, process.env.SESSION_SECRET!);
  if (!s) return new Response(JSON.stringify({ ok: false }), { status: 401,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return new Response(JSON.stringify({ ok: true, email: s.email, name: s.name,
    picture: s.picture, exp: s.exp }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
