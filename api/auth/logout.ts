import { cookie } from '../../lib/session';
export const config = { runtime: 'edge' };

export default async function handler() {
  const h = new Headers({ Location: '/api/auth/login' });
  h.append('Set-Cookie', cookie('ik_session', '', 0));
  return new Response(null, { status: 302, headers: h });
}
