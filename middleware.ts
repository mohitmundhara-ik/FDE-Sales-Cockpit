/* Gate every request. Nothing is served until a valid session cookie is present,
   so the HTML never reaches an unauthenticated browser.
   This is the part a standalone file cannot do. */
import { verify } from './lib/session';

export const config = {
  matcher: ['/((?!api/auth|_vercel|favicon.ico).*)']
};

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new Response('SESSION_SECRET is not set. See README.', { status: 500 });
  }

  const raw = (req.headers.get('cookie') || '')
    .split(';').map(c => c.trim())
    .find(c => c.startsWith('ik_session='))?.split('=').slice(1).join('=');

  const sess = await verify(raw, secret);
  if (sess) return; // authenticated: fall through to the static file

  // Not signed in. Send them to Google and come back to where they were headed.
  const to = new URL('/api/auth/login', url.origin);
  to.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(to.toString(), 302);
}
