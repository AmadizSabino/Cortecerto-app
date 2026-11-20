/** Free click-to-send WhatsApp link (opens WhatsApp with the text ready to send). */
export function waLink(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9) digits = '351' + digits // Portuguese number without country code
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
