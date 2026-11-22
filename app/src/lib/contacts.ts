import { waNumber } from './whatsapp'

/**
 * Picking clients from the phone's contacts (Contact Picker API: Chrome on
 * Android). Other browsers don't offer it; the invite page then asks for the
 * number by hand. Only the contacts the person picks are read.
 */
interface ContactsManager { select(props: string[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]> }

export const canPickContacts = () => typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window

export interface Picked { name: string; phone: string }

export async function pickContacts(): Promise<Picked[]> {
  const mgr = (navigator as Navigator & { contacts?: ContactsManager }).contacts
  if (!mgr) return []
  const rows = await mgr.select(['name', 'tel'], { multiple: true })
  return cleanContacts(rows)
}

/** First name and first mobile-looking number of each contact; drops ones without a number and repeats. */
export function cleanContacts(rows: { name?: string[]; tel?: string[] }[]): Picked[] {
  const seen = new Set<string>()
  const out: Picked[] = []
  for (const r of rows) {
    const tels = (r.tel ?? []).map(t => t.trim()).filter(t => waNumber(t).length >= 9)
    const tel = tels.find(t => /^9/.test(t.replace(/\D/g, '').replace(/^(00)?351/, ''))) ?? tels[0]
    if (!tel) continue
    const key = waNumber(tel)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: (r.name?.[0] ?? '').trim() || 'Cliente', phone: tel })
  }
  return out
}

/** The invitation, with the salon's booking link. */
export function inviteText(clientName: string, salonName: string, link: string): string {
  const first = clientName.trim().split(/\s+/)[0]
  return `Olá${first && first !== 'Cliente' ? ` ${first}` : ''}! O ${salonName} já tem marcações online. Escolha o dia e a hora aqui, em segundos: ${link}`
}
