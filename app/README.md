# CorteCerto app

The production app, built from the [prototype](../prototype/index.html). React + Vite PWA, Supabase (EU region) for data and logins, hosted on Cloudflare Pages.

## Run locally

1. Create a free Supabase project (region: Frankfurt, `eu-central-1`).
2. In the Supabase SQL editor, run `../supabase/migrations/0001_core.sql`.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project settings > API).
4. `npm install && npm run dev`, open http://localhost:5173/painel and sign in with your email.
5. Put your user id into `../supabase/seed.sql`, run it, then open `/s/barbearia-demo` to book.

`npm test` runs the unit tests (slot calculation, WhatsApp links).

## Deploy (Cloudflare Pages, free)

Connect this repo in Cloudflare Pages with root directory `app`, build command `npm run build`, output `dist`, and the two `VITE_SUPABASE_*` variables. In Supabase > Authentication > URL configuration, add the Pages URL as the site URL.

## What's here

- `/s/:slug`: public booking page (service, professional, day and time, client details, opt-in consent, MB Way deposit instructions).
- `/painel`: salon agenda by day with confirm, done, no-show, cancel, deposit received, and a WhatsApp message link.
- Database rules: clients book through `create_booking`, which validates the slot and blocks double booking; only the salon owner can read client data.

Next: salon sign-up and onboarding, services/team/hours editing, themes.
