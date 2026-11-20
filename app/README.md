# CorteCerto app

The production app, built from the [prototype](../prototype/index.html). React + Vite PWA, Supabase (EU region) for data and logins, hosted on Cloudflare Pages.

## Run locally

1. Create a free Supabase project (an EU region, e.g. Frankfurt or Stockholm).
2. In the Supabase SQL editor, run the files in `../supabase/migrations/` in order.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project settings > API).
4. `npm install && npm run dev`, open http://localhost:5173/painel and sign in with your email.
5. The first sign-in goes to `/registar`, a 4-step setup: salon type and name, services and prices, team and hours, WhatsApp and MB Way deposit. Then open your booking link to book.
   (`../supabase/seed.sql` creates a demo salon instead, if you prefer.)

`npm test` runs the unit tests (slot calculation, WhatsApp links, client list, setup checklist).

## Deploy (Cloudflare Workers, free)

The `cortecerto-app` Worker builds `main` with the default settings (root directory `/`, deploy command `npx wrangler deploy`). `../wrangler.jsonc` runs the app build first and serves `app/dist` as a single-page app. The Supabase URL and publishable key are in `.env.production`. They're public by design, so nothing has to be entered in Cloudflare.

In Supabase > Authentication > URL configuration, set the site URL to the Worker's address and add `<address>/**` to the redirect URLs.

## What's here

- `/s/:slug`: public booking page (service, professional, day and time, client details, opt-in consent, MB Way deposit instructions).
- `/registar`: salon onboarding. Services start from suggestions by salon type, and the salon sets every price.
- `/definicoes`: edit salon details, services and prices, team and hours. Services and team members are switched off rather than deleted, so past bookings keep their history.
- `/clientes`: client list built from the bookings, grouped by phone number. Search by name or phone, filter by at risk (no visit for 45 days and nothing booked), no-shows or message consent, and open a client to see their history and total spent. Each client also has notes and a birthday (day and month only), kept in `client_notes` (migration 0003); coming birthdays get a filter, a 🎂 tag and a "Dar os parabéns" WhatsApp message for clients who opted in. "Convidar a voltar" sends a WhatsApp invite with the booking link, only to clients who opted in to messages.
- `/poster`: printable A4 poster with the salon's booking QR code, in the salon's theme, plus the link to copy for the Instagram bio and Google profile. The QR code uses qrcode-generator 1.4.4 (MIT), vendored in `src/vendor/`.
- `/painel`: salon agenda by day with confirm, done, no-show, cancel, deposit received, and a WhatsApp message link.
- Setup checklist ("Primeiros passos") on the agenda: services, team and hours, WhatsApp, MB Way when a deposit is asked, poster, Instagram bio, Google profile and the first booking. Steps the app can't check are ticked by the owner and kept in the browser. It hides when done or when closed.
- Database rules: clients book through `create_booking`, which validates the slot and blocks double booking; only the salon owner can read client data.

Themes: the 32 themes from the prototype live in `src/lib/themes.ts`. The owner picks one at sign-up or in settings, and a client can choose their own on the booking page (kept only in their browser).

Next: deploy to Cloudflare Pages and test the full flow on the live Supabase project.
