# CorteCerto app

The production app, built from the [prototype](../prototype/index.html). React + Vite PWA, Supabase (EU region) for data and logins, hosted on Cloudflare Pages.

## Run locally

1. Create a free Supabase project (an EU region, e.g. Frankfurt or Stockholm).
2. In the Supabase SQL editor, run the files in `../supabase/migrations/` in order.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project settings > API).
4. `npm install && npm run dev`, open http://localhost:5173/painel and sign in with your email.
5. The first sign-in goes to `/registar`, a 4-step setup: salon type and name, services and prices, team and hours, WhatsApp and MB Way deposit. Then open your booking link to book.
   (`../supabase/seed.sql` creates a demo salon instead, if you prefer.)

`npm test` runs the unit tests (slot calculation, WhatsApp links).

## Deploy (Cloudflare Workers, free)

In the Cloudflare dashboard, open the `cortecerto-app` Worker, then Settings > Build:
- Root directory: `app`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy` (uses `wrangler.jsonc`, which serves `dist` as a single-page app)
- Build variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. They must be **build** variables, because Vite bakes them in at build time.

In Supabase > Authentication > URL configuration, set the site URL to the Worker's address and add `<address>/**` to the redirect URLs.

## What's here

- `/s/:slug`: public booking page (service, professional, day and time, client details, opt-in consent, MB Way deposit instructions).
- `/registar`: salon onboarding. Services start from suggestions by salon type, and the salon sets every price.
- `/definicoes`: edit salon details, services and prices, team and hours. Services and team members are switched off rather than deleted, so past bookings keep their history.
- `/painel`: salon agenda by day with confirm, done, no-show, cancel, deposit received, and a WhatsApp message link.
- Database rules: clients book through `create_booking`, which validates the slot and blocks double booking; only the salon owner can read client data.

Themes: the 32 themes from the prototype live in `src/lib/themes.ts`. The owner picks one at sign-up or in settings, and a client can choose their own on the booking page (kept only in their browser).

Next: deploy to Cloudflare Pages and test the full flow on the live Supabase project.
