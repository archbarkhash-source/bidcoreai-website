# Free Federal Go/No-Go — setup & deployment

The interactive lead magnet at **`/go-no-go`**. A visitor signs up (Google or an
emailed code), picks a country, connects their **own** SAM.gov API key, and gets
an instant 12-criterion bid/no-bid analysis on any live federal solicitation.

It is deliberately self-contained: its own database, its own auth, its own
scoring. Nothing here touches the BidcoreAI product app or its database — this
is the one surface an unauthenticated stranger can write to, so it shares
nothing with paying tenants' data.

## Files

| Path | What it does |
|---|---|
| `views/go-no-go.html` | The page shell (SEO head, inline icons, mount point) |
| `public/go-no-go.css` | Styles — white, black text, one orange accent |
| `public/go-no-go.js` | The whole client, vanilla JS, no build step |
| `api/routes.js` | The API, mounted at `/api/go-no-go` |
| `api/auth.js` | Google sign-in + emailed 6-digit code + sessions |
| `api/db.js` | Neon connection and schema (created on first use) |
| `api/samgov.js` | SAM.gov client, per-key rate-limit cooldown |
| `api/scoring.js` | The 12-criterion Go/No-Go rubric |
| `api/secretbox.js` | AES-256-GCM encryption for stored API keys |
| `api/geocode.js` | Address → lat/lng for the distance criterion |

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and in
`.env` for local development).

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | **yes** | The `Bidcoreai-Webopp` Neon branch connection string. Vercel's Neon integration sets this for you when you connect the database. |
| `SECRET_KEY` | **yes** | Any long random string. Encrypts visitors' stored SAM.gov keys. **Rotating it invalidates every stored key** (visitors are asked to paste theirs again — nothing breaks). Must NOT be shared with the product app. |
| `GOOGLE_CLIENT_ID` | no | Enables "Continue with Google". Without it the button is hidden and the emailed-code path is the only way in. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM_NAME` | no | Delivers the 6-digit code. Already set for the contact form. Without them the code is printed to the server log instead (fine locally, useless in production). |
| `APP_URL` | no | Where "Create your account" links. Defaults to `https://app.bidcoreai.com`. |

### Google sign-in setup

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   **Create credentials** → **OAuth client ID** → **Web application**.
2. Authorised JavaScript origins: `https://bidcoreai.com`,
   `https://www.bidcoreai.com`, and `http://localhost:3000` for local testing.
   (No redirect URI is needed — Google Identity Services returns the token to
   the page, it doesn't redirect.)
3. Copy the client ID into `GOOGLE_CLIENT_ID`.

The ID token is verified server-side against Google's public keys, including
that its audience is this client ID — a token minted for another site is
rejected.

## Local development

```bash
npm install
# minimum to boot; without DATABASE_URL the page loads but every action 503s
DATABASE_URL="postgres://…" SECRET_KEY="anything-long" npm run dev
# → http://localhost:3000/go-no-go
```

Without SMTP configured, the 6-digit code is printed to the terminal:

```
[go-no-go] access code for you@example.com: 481920
```

`npm run check` syntax-checks every file the page depends on.

## Deployment

The app is a plain Express server that reads `PORT` from the environment, so
nothing in it is host-specific. It runs on Vercel and Render from the same
repo; only the place you set the environment variables differs.

### Running both at once — read this first

`SECRET_KEY` **must be identical on both hosts**, and so must `DATABASE_URL`.
`SECRET_KEY` derives the key that encrypts visitors' SAM.gov API keys, so a
workspace whose key was saved on one host cannot be decrypted by the other —
the visitor would be asked to add their key again, and asked again every time
traffic moved between hosts. One database, two front doors, one secret.

### Which host should hold the domain

* **Vercel** — no cold start. A public page that takes the best part of a
  minute to answer the first visit of the hour has already lost that visitor.
* **Render** — free and starter instances sleep after 15 minutes idle and take
  roughly 30–60s to wake. Good as a warm standby or a staging URL; poor as the
  front door for an ad campaign unless on a plan that does not sleep.

A sensible arrangement is Vercel on the public domain and Render running the
same code at its own URL, ready to take over by a DNS change.

### Render

`render.yaml` in the repo root is a blueprint: **New → Blueprint** in the Render
dashboard, point it at this repo, and fill in the variables marked `sync: false`.
Or configure a Web Service by hand — build `npm ci`, start `npm start`.

Remember to add the Render URL to the Google console's **Authorised JavaScript
origins**, or "Continue with Google" fails there with `origin_mismatch`.

### Vercel

`vercel.json` routes every request through `server.js` as a Node function, so
the existing marketing pages and this one deploy together, unchanged.

1. Import the repo into Vercel (Framework preset: **Other**).
2. Connect the **Bidcoreai-Webopp** Neon database — that sets `DATABASE_URL`.
3. Add `SECRET_KEY`, and `GOOGLE_CLIENT_ID` if you want Google sign-in.
4. Deploy. The database schema creates itself on the first request.

## How the scoring works

Twelve criteria, each 0-100, averaged:

NAICS · PSC · Project Magnitude · Distance from Office · Preferred State ·
Preferred Agency · Contract Type · Set-Aside · Capability Match · Bond Capacity ·
Past Performance · Bid Preparation Time

Bands are **set from the environment**, not written into the code — they are a
judgement about how cautious the tool should be, and worth revising once there
is real usage to look at:

| Variable | Default | Meaning |
|---|---|---|
| `GO_SCORE_MIN` | `55` | above this → **GO** |
| `NOT_SURE_SCORE_MIN` | `40` | at or above → **NOT SURE**; below → **NO-GO** |
| `UNKNOWN_RATIO` | `0.5` | this share of criteria unscored → **NEEDS MORE INFO** |

The defaults sit well below the product app's 85/65 on purpose. A free visitor
fills in a fraction of a real profile, so half their criteria rest at the
neutral 50 and pull every average toward the middle; judged on the paid bands,
genuinely good opportunities would come back NO-GO.

The page renders whatever the server reports, so retuning these changes every
sentence about them without a code edit.

Three results override the average:

* **Deadline passed** → 0, NO-GO. The bid is impossible, not merely unattractive.
* **Set-aside you don't hold** → 0, NO-GO. Same reason.
* **Half or more criteria unknown** → **NEEDS MORE INFO**, not a verdict. A new
  visitor with an empty profile scores ~58 purely from neutral 50s; calling that
  NO-GO would be judging the absence of a profile, not the opportunity.

A score of 50 always means "nothing on file — neutral", never "bad", so the page
can honestly point at which missing input would sharpen the answer.

> **Keep in step with the product.** `api/scoring.js` mirrors the rubric in the
> BidcoreAI app (`backend/quick_go_no_go.py`, `backend/capability_matching.py`).
> The duplication is intentional — this site shares no runtime with the product —
> but a change to the bands or thresholds in one belongs in the other too.

## Abuse limits

Per workspace, per day: **60 searches**, **40 analyses**. Both reset at UTC
midnight and are enforced server-side. Searches spend the visitor's own SAM.gov
quota, never a shared key.

## Data stored

`workspaces` (email, company, profile, encrypted API key), `capabilities`,
`past_performance`, and `go_no_go_events` (a lead funnel: sign-ins, key links,
searches, scores). Sessions last 30 days and slide forward on every visit — the
page is meant to be bookmarked and used weekly.
