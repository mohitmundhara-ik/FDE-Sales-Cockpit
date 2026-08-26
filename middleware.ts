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

/* Gate every request. Nothing is served until a valid session cookie is present,
   so the HTML never reaches an unauthenticated browser. */

export const config = {
  /* /api is excluded entirely: those routes do their own checking.
     /api/me in particular must be able to answer 401 as JSON so the page can
     fall back gracefully - if middleware redirected it, the fetch would follow
     the 302 to Google and the page would hang instead of degrading. */
  matcher: ['/((?!api/|_vercel|favicon.ico).*)']
};

const REQUIRED = ['SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ALLOWED_DOMAINS'];

function setupPage(missing: string[], origin: string) {
  const redirectUri = `${origin}/api/auth/callback`;
  const rows = REQUIRED.map(k => {
    const bad = missing.includes(k);
    const hint: Record<string, string> = {
      SESSION_SECRET: 'Any long random string. Generate with <code>openssl rand -base64 32</code>',
      GOOGLE_CLIENT_ID: 'From Google Cloud Console, OAuth 2.0 Client ID',
      GOOGLE_CLIENT_SECRET: 'From the same Google credential',
      ALLOWED_DOMAINS: 'Comma separated. Use <code>interviewkickstart.com</code>'
    };
    return `<tr><td><code>${k}</code></td>
      <td class="${bad ? 'bad' : 'ok'}">${bad ? 'missing' : 'set'}</td>
      <td>${hint[k]}</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup needed - FDE Sales Cockpit</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
 background:#FBFCFD;color:#0A1F44;line-height:1.6;padding:44px 20px}
.w{max-width:760px;margin:0 auto;background:#fff;border:1px solid #E3EAF2;
 border-radius:12px;padding:32px 36px;box-shadow:0 1px 2px rgba(10,31,68,.04)}
.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:#2A7AB0;
 font-weight:700;margin:0 0 8px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 10px}
p{font-size:14.5px;color:#3d4c63;margin:0 0 14px}
.good{background:#EEF8F2;border-left:3px solid #127A4B;padding:12px 15px;
 border-radius:0 8px 8px 0;font-size:13.5px;color:#14392a;margin:0 0 20px}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin:8px 0 20px}
th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:#7286a0;
 border-bottom:1px solid #D2DEEA;padding:8px 10px 8px 0;font-weight:700}
td{padding:10px 10px 10px 0;border-bottom:1px solid #E3EAF2;vertical-align:top;color:#3d4c63}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;
 background:#EAF3FA;color:#1F5E8A;padding:2px 6px;border-radius:4px}
.bad{color:#A8322F;font-weight:650} .ok{color:#127A4B;font-weight:650}
ol{padding-left:20px;margin:0 0 14px} li{font-size:14px;color:#3d4c63;margin-bottom:9px}
.uri{display:block;background:#0A1F44;color:#E8EFF7;padding:11px 14px;border-radius:8px;
 font-family:ui-monospace,Menlo,monospace;font-size:13px;margin:8px 0 0;word-break:break-all}
.note{font-size:12.5px;color:#7286a0;border-top:1px solid #E3EAF2;padding-top:14px;margin-top:22px}
</style></head><body><div class="w">
<p class="eyebrow">Deployment setup</p>
<h1>Almost there - four environment variables to set</h1>
<div class="good"><b>The gate is working.</b> It refused to serve the cockpit because it cannot
verify anyone yet. Failing closed is the correct behaviour: it will not hand out the page
until sign-in is configured.</div>

<table><thead><tr><th>Variable</th><th>Status</th><th>Value</th></tr></thead>
<tbody>${rows}</tbody></table>

<ol>
<li>In <b>Google Cloud Console</b> - APIs &amp; Services - Credentials - create an
    <b>OAuth 2.0 Client ID</b> of type <b>Web application</b>, and add this exact
    authorised redirect URI:
    <span class="uri">${redirectUri}</span></li>
<li>In <b>Vercel</b> - your project - Settings - Environment Variables, add the four
    variables above for the <b>Production</b> environment.</li>
<li><b>Redeploy.</b> Environment variables are read at build and request time, so an
    existing deployment will not pick them up on its own.</li>
</ol>

<p class="note">Optional: <code>SESSION_HOURS</code> defaults to 24.
<code>SESSION_COOKIE_DOMAIN</code> is only for single sign-on with the CBI dashboard, and
only works once both apps are on a shared parent domain - not on <code>*.vercel.app</code>.
Full detail is in the README.</p>
</div></body></html>`;
}

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const missing = REQUIRED.filter(k => !process.env[k]);

  if (missing.length) {
    return new Response(setupPage(missing, url.origin), {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const raw = readCookie(req, 'ik_session');

  const sess = await verifySession(raw, process.env.SESSION_SECRET!);
  if (sess) return; // authenticated: fall through to the static file

  const to = new URL('/api/auth/login', url.origin);
  to.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(to.toString(), 302);
}
