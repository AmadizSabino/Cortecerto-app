/** The address CorteCerto is known by. Links people share (booking, WhatsApp, QR) always use it. */
export const PUBLIC_ORIGIN = 'https://cortecerto.pt'
/** The old address keeps working for apps installed before the move, but shared links say cortecerto.pt. */
const OLD_HOSTS = new Set(['cortecerto-app.amadiz-sabino.workers.dev'])

/** Origin for links meant for other people. Previews and localhost keep their own, so they can be tested. */
export function publicOrigin(loc: { hostname: string; origin: string } = location): string {
  return OLD_HOSTS.has(loc.hostname) ? PUBLIC_ORIGIN : loc.origin
}
