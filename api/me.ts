/* --- inlined session helpers: Web Crypto only, no imports, no dependencies ---
   Kept in each entry point on purpose. Vercel builds middleware and each
   /api route as separate bundles, and cross-directory relative imports are a
   common cause of "module not found" on non-framework projects. Nothing to
   resolve means nothing to fail. */
const _enc = new TextEncoder();
type Session = { email: string; name: string; picture?: string; exp: number };
const _b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const _unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function _key(secret: string) {
  return crypto.subtle.importKey('raw', _enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(s: Session, secret: string): Promise<string> {
  const body = _b64u(_enc.encode(JSON.stringify(s)));
  const sig = await crypto.subtle.sign('HMAC', await _key(secret), _enc.encode(body));
  return body + '.' + _b64u(sig);
}
async function verifySession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await _key(secret), _unb64u(sig), _enc.encode(body)); }
  catch { return null; }
  if (!ok) return null;
  try {
    const s: Session = JSON.parse(new TextDecoder().decode(_unb64u(body)));
    return (!s.exp || Date.now() > s.exp) ? null : s;
  } catch { return null; }
}
function domainAllowed(email: string, allowed: string): boolean {
  const d = (email.split('@')[1] || '').toLowerCase();
  return allowed.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(d);
}
function sessionCookie(name: string, value: string, maxAgeSec: number): string {
  const dom = process.env.SESSION_COOKIE_DOMAIN;
  return [name + '=' + value, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax',
    'Max-Age=' + maxAgeSec, dom ? 'Domain=' + dom : ''].filter(Boolean).join('; ');
}
function readCookie(req: Request, name: string): string | undefined {
  return (req.headers.get('cookie') || '').split(';').map(c => c.trim())
    .find(c => c.startsWith(name + '='))?.split('=').slice(1).join('=');
}

/* The cockpit calls this on load. If it answers, the page skips its own
   sign-in gate and uses the real identity instead. */
export const config = { runtime: 'edge' };

const notConfigured = () => new Response(
  JSON.stringify({ ok: false, error: 'NOT_CONFIGURED',
    detail: 'Set SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ALLOWED_DOMAINS in Vercel, then redeploy.' }),
  { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async function handler(req: Request) {
  if (!process.env.SESSION_SECRET) return notConfigured();
  const raw = readCookie(req, 'ik_session');
  const s = await verifySession(raw, process.env.SESSION_SECRET!);
  if (!s) return new Response(JSON.stringify({ ok: false }), { status: 401,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return new Response(JSON.stringify({ ok: true, email: s.email, name: s.name,
    picture: s.picture, exp: s.exp }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
