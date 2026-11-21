# CorteCerto app

The production app, built from the [prototype](../prototype/index.html). React + Vite PWA, Supabase (EU region) for data and logins, hosted on Cloudflare Pages.

## Run locally

1. Create a free Supabase project (an EU region, e.g. Frankfurt or Stockholm).
2. In the Supabase SQL editor, run the files in `../supabase/migrations/` in order (0001 to 0008).
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project settings > API).
4. `npm install && npm run dev`, open http://localhost:5173/painel and sign in with your email.
5. The first sign-in goes to `/registar`, a 4-step setup: salon type and name, services and prices, team and hours, WhatsApp and MB Way deposit. Then open your booking link to book.
   (`../supabase/seed.sql` creates a demo salon instead, if you prefer.)

`npm test` runs the unit tests (slot calculation, WhatsApp links, client list, setup checklist, terms acceptance, reminders, client changes, next visit, queue).

## Deploy (Cloudflare Workers, free)

The `cortecerto-app` Worker builds `main` with the default settings (root directory `/`, deploy command `npx wrangler deploy`). `../wrangler.jsonc` runs the app build first and serves `app/dist` as a single-page app. The Supabase URL and publishable key are in `.env.production`. They're public by design, so nothing has to be entered in Cloudflare.

In Supabase > Authentication > URL configuration, set the site URL to the Worker's address and add `<address>/**` to the redirect URLs.

## Booking emails

`../worker/index.ts` serves the app and answers `POST /api/notify-booking`. After a client books, the booking page calls it, and the Worker emails the salon owner (the email they sign in with) through Resend. Migration 0005 adds `claim_booking_notification`, which only the service role can call and which hands out each booking once, within 10 minutes of it being made.

To turn it on, add two secrets in Cloudflare > Workers > cortecerto-app > Settings > Variables and Secrets:

- `RESEND_API_KEY`: from resend.com > API Keys.
- `SUPABASE_SERVICE_ROLE_KEY`: the secret key from Supabase > Project settings > API Keys. Never put it in the code or in `.env.production`.

Until a domain is verified in Resend, emails go from the test sender `onboarding@resend.dev`, which only delivers to the email the Resend account was opened with. After verifying the domain, add a variable `EMAIL_FROM` such as `CorteCerto <avisos@cortecerto.pt>`. Without the secrets nothing is sent and the app works as before.

## What's here

- `/s/:slug`: public booking page (service, professional, day and time, client details, opt-in consent, MB Way deposit instructions).
- `/registar`: salon onboarding. Services start from suggestions by salon type, and the salon sets every price.
- `/definicoes`: edit salon details, services and prices, team and hours. Services and team members are switched off rather than deleted, so past bookings keep their history.
- `/clientes`: client list built from the bookings, grouped by phone number. Search by name or phone, filter by at risk (no visit for 45 days and nothing booked), no-shows or message consent, and open a client to see their history and total spent. Each client also has notes and a birthday (day and month only), kept in `client_notes` (migration 0003); coming birthdays get a filter, a 🎂 tag and a "Dar os parabéns" WhatsApp message for clients who opted in. "Convidar a voltar" sends a WhatsApp invite with the booking link, only to clients who opted in to messages.
- `/poster`: printable A4 poster with the salon's booking QR code, in the salon's theme, plus the link to copy for the Instagram bio and Google profile. The QR code uses qrcode-generator 1.4.4 (MIT), vendored in `src/vendor/`.
- `/lembretes`: WhatsApp reminders for tomorrow's bookings (any day can be picked). Each opens WhatsApp with the message ready, including any deposit still owed, and is marked as sent in `bookings.reminder_sent_at` (migration 0006; before it runs, the browser remembers). The agenda shows how many are left for tomorrow. Reminders are part of the service, so they don't depend on the marketing consent, which now covers news and promotions only.
- `/m/:id`: the client's private page for a booking, linked from the confirmation page, the WhatsApp confirmation and the reminder. The client can cancel or move the booking up to the limit the salon sets in settings (2 hours before by default, or not at all). Moving puts the booking back to pending for the salon to confirm, and the agenda tags what the client did. Rules live in the database (migration 0007), so the limit can't be bypassed.
- `/fila` and `/f/:slug`: walk-in queue (migration 0008). The salon opens or closes the queue, calls people with a ready WhatsApp message ("É a sua vez", and "está quase" for the next ones), marks them served or gone, and adds people at the counter. Clients scan the queue QR poster (`/poster?fila=1`), join with name and phone, and see how many are ahead and a rough wait (people ahead × average service ÷ team), refreshed every 15 seconds. One place per phone at a time.
- `/painel`: salon agenda by day with confirm, done, no-show, cancel, deposit received, and a WhatsApp message link. Marking a visit as done opens "Marcar a próxima visita": same client, service and professional, a few weeks ahead (3 for barbers, 6 for hair salons, adjustable), on a day the salon is open and at the free time closest to today's. The new booking is confirmed straight away and can be sent to the client by WhatsApp.
- Setup checklist ("Primeiros passos") on the agenda: services, team and hours, WhatsApp, MB Way when a deposit is asked, poster, Instagram bio, Google profile and the first booking. Steps the app can't check are ticked by the owner and kept in the browser. It hides when done or when closed.
- Terms: `/termos`, `/tratamento-dados` and `/privacidade` are drafts for legal review, in `src/lib/legal.ts`. The owner accepts the terms and the data processing agreement at sign-up, and each acceptance is stored in `legal_acceptances` (migration 0004) with the document version, time and browser. Changing a document's `version` asks every owner to accept again before the panel opens. The booking page links to the privacy policy.
- Database rules: clients book through `create_booking`, which validates the slot and blocks double booking; only the salon owner can read client data.

Themes: the 32 themes from the prototype live in `src/lib/themes.ts`. The owner picks one at sign-up or in settings, and a client can choose their own on the booking page (kept only in their browser).

Next: deploy to Cloudflare Pages and test the full flow on the live Supabase project.
