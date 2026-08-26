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

/* Exchange the code, verify the identity, enforce the domain allow-list,
   then issue our own signed session cookie. */

export const config = { runtime: 'edge' };
const HOURS = Number(process.env.SESSION_HOURS || 24);

const deny = (msg: string, detail: string) =>
  new Response(
    `<!doctype html><meta charset=utf-8><title>Access denied</title>
     <style>body{font-family:system-ui;background:#FBFCFD;color:#0A1F44;display:grid;
     place-items:center;height:100vh;margin:0}div{max-width:460px;padding:32px;background:#fff;
     border:1px solid #E3EAF2;border-radius:12px}h1{font-size:19px;margin:0 0 8px}
     p{font-size:14px;color:#3d4c63;line-height:1.6;margin:0 0 6px}
     a{color:#1F5E8A}</style>
     <div><h1>${msg}</h1><p>${detail}</p>
     <p style="margin-top:14px"><a href="/api/auth/login">Try a different account</a></p></div>`,
    { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } });

const notConfigured = () => new Response(
  JSON.stringify({ ok: false, error: 'NOT_CONFIGURED',
    detail: 'Set SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ALLOWED_DOMAINS in Vercel, then redeploy.' }),
  { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async function handler(req: Request) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SESSION_SECRET) return notConfigured();
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const jar = Object.fromEntries((req.headers.get('cookie') || '').split(';')
    .map(c => c.trim().split('=')).map(([k, ...v]) => [k, v.join('=')]));

  if (!code || !state || state !== jar['ik_state']) {
    return deny('Sign-in could not be completed', 'The request did not match the one that started it. Start again from the beginning.');
  }

  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: `${url.origin}/api/auth/callback`,
    grant_type: 'authorization_code'
  });
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
  }).then(r => r.json() as any);

  if (!tok.id_token) return deny('Sign-in failed', 'Google did not return an identity token.');

  // id_token is fresh from Google over TLS, so decoding the payload is sufficient here.
  const claims = JSON.parse(atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  const email = String(claims.email || '').toLowerCase();
  const allowed = process.env.ALLOWED_DOMAINS || '';

  if (!claims.email_verified) return deny('Unverified account', 'That Google account has no verified email address.');
  if (!domainAllowed(email, allowed)) {
    return deny('Interview Kickstart accounts only',
      `<b>${email}</b> is not on an approved domain. Sign in with your Interview Kickstart account.`);
  }

  const token = await signSession(
    { email, name: claims.name || email, picture: claims.picture, exp: Date.now() + HOURS * 3600e3 },
    process.env.SESSION_SECRET!
  );

  const next = decodeURIComponent(jar['ik_next'] || '/');
  const h = new Headers({ Location: next.startsWith('/') ? next : '/' });
  h.append('Set-Cookie', sessionCookie('ik_session', token, HOURS * 3600));
  h.append('Set-Cookie', 'ik_state=; Path=/; Max-Age=0');
  h.append('Set-Cookie', 'ik_next=; Path=/; Max-Age=0');
  return new Response(null, { status: 302, headers: h });
}
