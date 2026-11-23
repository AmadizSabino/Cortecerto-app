/**
 * The plan shown on the landing page and the salon's subscription page.
 * Price agreed with Francisco on 2026-11-21: 19,90 € a month plus IVA.
 * Change it here only; every page reads it.
 */
export const PLAN = {
  name: 'CorteCerto',
  priceCents: 1990, // before IVA
  vatRate: 0.23,
  trialDays: 30,
  provisional: false,
}

/** A salon whose booking page the landing page shows as an example ("Ver um exemplo"). */
export const EXAMPLE_SLUG = 'barba-e-beer'
