# FDE Sales Cockpit - gated access

Two things you asked for, and one of them needs saying plainly first.

## The honest part

The standalone `FDE_Sales_Cockpit_v5.html` **cannot** enforce access. A single HTML
file has no server, so anyone holding the file reads every byte of it - the competitor
teardowns, the guardrails, the call analysis. The sign-in inside that file identifies
who is using the browser and timestamps their work. It is a log, not a lock.

This package is the lock. It puts the same cockpit behind a server-side check so the
HTML is never sent to an unauthenticated browser.

## What this enforces

- Google sign-in, verified server-side against the `id_token`.
- A domain allow-list. Only `@interviewkickstart.com` (and anything else you add) gets in.
  Everyone else sees a refusal page, not the cockpit.
- A 24-hour signed, HttpOnly session cookie. The browser cannot read or forge it.
- Edge middleware in front of **every** path, so there is no unprotected route.

## If you see "four environment variables to set"

That page means the gate is installed and working - it refused to serve the cockpit
because it cannot verify anyone yet. Set the four variables below and **redeploy**;
Vercel does not apply new environment variables to an existing deployment.


## Every file, and what it does

| File | Purpose | Deployed |
|---|---|---|
| `public/index.html` | The cockpit. This is the only page served. | yes |
| `middleware.ts` | The gate. Runs in front of every path; serves nothing without a valid session. Also renders the setup page when environment variables are missing. | yes |
| `api/auth/login.ts` | Starts Google OAuth. | yes |
| `api/auth/callback.ts` | Verifies the identity, enforces the domain allow-list, issues the session cookie. | yes |
| `api/auth/logout.ts` | Clears the session. | yes |
| `api/me.ts` | Answers the cockpit on load so it can skip its own sign-in and use the verified identity. | yes |
| `vercel.json` | Pins `outputDirectory` to `public`, sets security headers. | config |
| `tsconfig.json` · `package.json` | Type-checking only. No build step. | config |
| `.vercelignore` | Keeps `tools/` out of the build. | config |
| `.env.example` | Template for the four variables. Never commit real values. | no |
| `tools/regen_jobs.py` | Rebuilds the job dataset from a fresh scrape. Run locally. | no |

**There is no `lib/` folder.** The session helpers are inlined into each entry point
on purpose: Vercel bundles middleware and each `/api` route separately, and
cross-directory imports are a common cause of module-not-found on non-framework
projects.

**Delete any `index.html` at the repo root.** Two index files is a trap - `public/`
currently wins because `outputDirectory` says so, but a stray root file will confuse
anyone reading the repo later.

## Vercel project settings

Import as **Framework Preset: Other**. No build command, no install step.
Vercel serves `public/` as the static root, turns `api/*.ts` into Edge Functions and
picks up `middleware.ts` automatically. The helper code is inlined in each entry point
rather than shared from `lib/`, so there are no cross-directory imports for the bundler
to resolve.

## Deploy

1. **Google Cloud Console** - APIs & Services - Credentials - Create OAuth client ID
   - Type: Web application
   - Authorised redirect URI: `https://YOUR-DOMAIN/api/auth/callback`
2. Push this folder to a repo, import it in Vercel.
3. Set environment variables:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `ALLOWED_DOMAINS` | `interviewkickstart.com` |
| `SESSION_HOURS` | `24` |
| `SESSION_COOKIE_DOMAIN` | *(only for SSO - see below)* |

4. Deploy. Visiting any path now redirects to Google.

## Single sign-on with the CBI dashboard

`cbi-dashboard-ik.vercel.app` currently returns a bare **401 with no login route**, which
is Vercel Deployment Protection - the platform's own gate, not application auth. That
matters, because it changes which SSO options are actually available.

**Option A - same Vercel team (no code, works today).**
Deploy this project into the same Vercel team as the CBI dashboard and turn on Vercel
Authentication. Anyone signed into Vercel as a team member reaches both without a second
prompt. *Limitation:* it authenticates Vercel **team seats**, not IK email addresses. Every
PA would need a Vercel seat, which is usually the reason this option gets rejected.

**Option B - shared Google client + parent-domain cookie (true SSO).**
This is what the package is written for.
- Put both apps on the same parent domain, e.g. `cockpit.interviewkickstart.com` and
  `cbi.interviewkickstart.com`.
- Set `SESSION_COOKIE_DOMAIN=.interviewkickstart.com` in **both**.
- Use the **same** `GOOGLE_CLIENT_ID` and the **same** `SESSION_SECRET` in both.

A session minted by either app is then accepted by the other, and the user signs in once.

> This will **not** work while either app is on `*.vercel.app`. `vercel.app` is on the
> Public Suffix List, so browsers refuse to set a cookie scoped across its subdomains.
> Custom domains are a hard requirement for Option B.

**Option C - same Google client only (no shared cookie, still feels seamless).**
If custom domains are not available yet, use the same `GOOGLE_CLIENT_ID` in both apps.
Each app keeps its own cookie, but because the user already has a live Google session the
second sign-in returns without a password prompt - one click, no credentials. This is the
realistic interim, and it needs no DNS work.

## How the page behaves once deployed

On load the cockpit calls `/api/me`. If it answers, the studio skips its own sign-in and
uses the verified Google identity, showing "verified by Google" and routing Sign out to
`/api/auth/logout`. Opened as a plain file the call fails and it falls back to the local
gate, so the same HTML works both ways.

## What it still does not do

- The activity log stays in the browser. Real auditing needs a database, and this package
  deliberately does not pretend otherwise.
- Anyone with a valid IK account sees everything. There are no per-section roles. If PAs
  should not see the competitor battle cards or the guardrails, that is a second build.
