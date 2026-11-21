# CorteCerto app

The production app, built from the [prototype](../prototype/index.html). React + Vite PWA, Supabase (EU region) for data and logins, hosted on Cloudflare Pages.

## Run locally

1. Create a free Supabase project (an EU region, e.g. Frankfurt or Stockholm).
2. In the Supabase SQL editor, run the files in `../supabase/migrations/` in order (0001 to 0013).
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project settings > API).
4. `npm install && npm run dev`, open http://localhost:5173/painel and sign in with your email.
5. The first sign-in goes to `/registar`, a 4-step setup: salon type and name, services and prices, team and hours, WhatsApp and MB Way deposit. Then open your booking link to book.
   (`../supabase/seed.sql` creates a demo salon instead, if you prefer.)

`npm test` runs the unit tests (slot calculation, WhatsApp links, client list, setup checklist, terms acceptance, reminders, client changes, next visit, queue).

## Deploy (Cloudflare Workers, free)

The `cortecerto-app` Worker builds `main` with the default settings (root directory `/`, deploy command `npx wrangler deploy`). `../wrangler.jsonc` runs the app build first and serves `app/dist` as a single-page app. The Supabase URL and publishable key are in `.env.production`. They're public by design, so nothing has to be entered in Cloudflare.

In Supabase > Authentication > URL configuration, set the site URL to the Worker's address and add `<address>/**` to the redirect URLs.

## Error reports

Uncaught errors, rejected promises and page crashes in the browser are sent to `POST /api/errors` (`../worker/errors.ts`) with the message, stack, page path without query, browser and build time; never client data. They show in Cloudflare > Workers > cortecerto-app > Logs, and are stored in `client_errors` (migration 0012, kept 30 days) once `SUPABASE_SERVICE_ROLE_KEY` is set. A crashed page shows a reload button instead of a blank screen.

## Installable app

The app installs to the home screen (`public/manifest.webmanifest`, icons in `public/`). `public/sw.js` keeps the app shell for offline opening: pages network first with the cached app as fallback, hashed assets cache first, and Supabase and `/api/*` never cached. Bump `VERSION` in `sw.js` to drop old caches. The panel shows an install card once (Android prompt, or Safari steps on iPhone).

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
- `/horarios` (from settings): each professional follows the salon's hours or has their own, with an optional break per day; time off for one professional or the whole salon (whole days or some hours, with a private reason). Migration 0009 adds `professional_hours` and `time_off`, and makes `busy_slots`, `create_booking` and `move_booking_by_client` treat time off as busy. The agenda shows the day's blocks.
- Privacy tools: settings export clients and bookings as CSV for Excel (semicolon, UTF-8). On the client list, "Apagar dados deste cliente" removes the client's name, phone, consent and notes and cancels their future bookings; past bookings stay as "Cliente apagado" for statistics. Migration 0010 adds `forget_client` and a nightly pg_cron job that does the same for clients with no booking in 3 years (enable pg_cron in Supabase > Database > Extensions).
- `/semana`: the week at a glance (Monday to Sunday), each day's bookings and time off with counts and expected revenue, a filter per professional, and a tap on a day opens it in the agenda (`/painel?dia=YYYY-MM-DD`).
- `/precos` (from settings): per service, which professionals do it and at what price and length when different (blank uses the service's). Migration 0011 adds `service_overrides` and `bookings.price_cents`, the price when booked, so revenue doesn't change with later price changes; `create_booking` uses the professional's price and length, and a moved booking keeps its length. The booking page shows a price range per service and only the professionals who do it.
- `/estatisticas`: revenue from completed visits (at the booking's price), visits, average ticket, no-show rate, client cancellations, new versus returning clients, revenue for the last 6 months, top services, team and busiest weekdays, for this month, last month, the last 3 months or this year.
- `/`: the public landing page (what the app does through a salon's day, features, price, FAQ, sign-up). The price shown comes from `src/lib/plan.ts` and is provisional until pricing is decided.
- `/acessos` (from settings): the owner invites team members by email, optionally as one of the professionals. When they sign in to `/painel` with that email (within 14 days) they join the salon and use the agenda, week (starting on their own), clients, queue and reminders; settings, prices, hours, statistics, exports, deleting client data and the terms stay with the owner. Migration 0013 adds `salon_members`, `salon_invites`, team policies on bookings, notes, walk-ins and time off (no deletes), and `accept_invites`, `my_salon` and `set_queue_open`. All pages find the salon with `src/lib/mySalon.ts`.
- `/painel`: salon agenda by day with confirm, done, no-show, cancel, deposit received, and a WhatsApp message link. "+ Nova marcação" adds phone or counter bookings (phone optional), and "Editar" changes the client, service, professional, day or time; both suggest free times but accept any time, and the database still blocks double bookings. Marking a visit as done opens "Marcar a próxima visita": same client, service and professional, a few weeks ahead (3 for barbers, 6 for hair salons, adjustable), on a day the salon is open and at the free time closest to today's. The new booking is confirmed straight away and can be sent to the client by WhatsApp.
- Setup checklist ("Primeiros passos") on the agenda: services, team and hours, WhatsApp, MB Way when a deposit is asked, poster, Instagram bio, Google profile and the first booking. Steps the app can't check are ticked by the owner and kept in the browser. It hides when done or when closed.
- Terms: `/termos`, `/tratamento-dados` and `/privacidade` are drafts for legal review, in `src/lib/legal.ts`. The owner accepts the terms and the data processing agreement at sign-up, and each acceptance is stored in `legal_acceptances` (migration 0004) with the document version, time and browser. Changing a document's `version` asks every owner to accept again before the panel opens. The booking page links to the privacy policy.
- Database rules: clients book through `create_booking`, which validates the slot and blocks double booking; only the salon owner can read client data.

Themes: the 32 themes from the prototype live in `src/lib/themes.ts`. The owner picks one at sign-up or in settings, and a client can choose their own on the booking page (kept only in their browser).

Next: deploy to Cloudflare Pages and test the full flow on the live Supabase project.
