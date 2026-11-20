/** Digits for a WhatsApp number: accepts "912 345 678", "+351 912…" and "00351 912…". */
export function waNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2) // international prefix
  if (digits.length === 9) digits = '351' + digits // Portuguese number without country code
  return digits
}

/** Free click-to-send WhatsApp link (opens WhatsApp with the text ready to send). */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`
}

/** "+351 965 738 127" for Portuguese numbers, "+<digits>" otherwise. */
export function formatPhone(phone: string): string {
  const d = waNumber(phone)
  return d.startsWith('351') && d.length === 12 ? `+351 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : '+' + d
}
