/* Signed session cookie. Edge runtime, Web Crypto only, no dependencies.
   The cookie is HMAC-signed and HttpOnly, so the browser cannot read or forge it. */

const enc = new TextEncoder();

export type Session = { email: string; name: string; picture?: string; exp: number };

async function key(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']);
}
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function sign(sess: Session, secret: string): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(sess)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function verify(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await key(secret), unb64u(sig), enc.encode(body));
  } catch { return null; }
  if (!ok) return null;                       // tampered or wrong secret
  try {
    const s: Session = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (!s.exp || Date.now() > s.exp) return null;   // expired
    return s;
  } catch { return null; }
}

/* Domain allow-list. ALLOWED_DOMAINS is a comma-separated env var. */
export function domainAllowed(email: string, allowed: string): boolean {
  const d = (email.split('@')[1] || '').toLowerCase();
  return allowed.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(d);
}

/* Cookie domain: set SESSION_COOKIE_DOMAIN to a shared parent (e.g. .interviewkickstart.com)
   so a session created by one app is accepted by the other. Left unset, the cookie is
   host-only and there is no cross-app SSO. */
export function cookie(name: string, value: string, maxAgeSec: number): string {
  const dom = process.env.SESSION_COOKIE_DOMAIN;
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    dom ? `Domain=${dom}` : ''
  ].filter(Boolean).join('; ');
}
