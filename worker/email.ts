import type { Claimed } from './index'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function bookingEmail(b: Claimed, appUrl: string): { subject: string; html: string; text: string } {
  const when = new Date(b.starts_at)
  const day = when.toLocaleDateString('pt-PT', { timeZone: b.salon_timezone, weekday: 'long', day: 'numeric', month: 'long' })
  const time = when.toLocaleTimeString('pt-PT', { timeZone: b.salon_timezone, hour: '2-digit', minute: '2-digit' })
  const price = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(b.price_cents / 100)
  const deposit = b.deposit === 'pendente' ? 'Sinal por MB Way: por confirmar na agenda.' : ''
  const agenda = `${appUrl}/painel`

  const lines = [
    `${b.client_name} marcou ${b.service_name} com ${b.professional_name}.`,
    `${day} às ${time} · ${price}`,
    `Telemóvel: ${b.client_phone}`,
    b.consent_messages ? 'Aceita receber mensagens do salão.' : 'Não aceitou mensagens de promoção.',
    deposit,
  ].filter(Boolean)

  return {
    subject: `Nova marcação: ${b.client_name}, ${b.service_name}, ${day} às ${time}`,
    text: `${b.salon_name}\n\n${lines.join('\n')}\n\nVer na agenda: ${agenda}\n`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1d1b18">
  <p style="color:#6b655c;margin:0 0 4px">${esc(b.salon_name)}</p>
  <h1 style="font-size:20px;margin:0 0 16px">Nova marcação</h1>
  ${lines.map(l => `<p style="margin:0 0 8px">${esc(l)}</p>`).join('\n  ')}
  <p style="margin:20px 0"><a href="${esc(agenda)}" style="background:#b5462f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver na agenda</a></p>
  <p style="color:#6b655c;font-size:12px">Enviado pela CorteCerto.</p>
</div>`,
  }
}

export interface ChangeClaimed {
  owner_email: string; salon_name: string; salon_timezone: string; action: 'cancelou' | 'mudou'
  client_name: string; client_phone: string; service_name: string; professional_name: string; starts_at: string
}

/** "Tiago cancelou" or "Tiago mudou para sexta às 10:00". */
export function changeEmail(c: ChangeClaimed, appUrl: string): { subject: string; html: string; text: string } {
  const when = new Date(c.starts_at)
  const day = when.toLocaleDateString('pt-PT', { timeZone: c.salon_timezone, weekday: 'long', day: 'numeric', month: 'long' })
  const time = when.toLocaleTimeString('pt-PT', { timeZone: c.salon_timezone, hour: '2-digit', minute: '2-digit' })
  const agenda = `${appUrl}/painel`
  const moved = c.action === 'mudou'
  const subject = moved
    ? `${c.client_name} mudou a marcação para ${day} às ${time}`
    : `${c.client_name} cancelou a marcação de ${day} às ${time}`
  const lines = [
    moved
      ? `${c.client_name} mudou ${c.service_name} com ${c.professional_name} para ${day} às ${time}. Confirme o novo horário na agenda.`
      : `${c.client_name} cancelou ${c.service_name} com ${c.professional_name} de ${day} às ${time}. A vaga ficou livre.`,
    `Telemóvel: ${c.client_phone}`,
  ]
  return {
    subject,
    text: `${c.salon_name}\n\n${lines.join('\n')}\n\nVer na agenda: ${agenda}\n`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1d1b18">
  <p style="color:#6b655c;margin:0 0 4px">${esc(c.salon_name)}</p>
  <h1 style="font-size:20px;margin:0 0 16px">${moved ? 'Marcação mudada' : 'Marcação cancelada'}</h1>
  ${lines.map(l => `<p style="margin:0 0 8px">${esc(l)}</p>`).join('\n  ')}
  <p style="margin:20px 0"><a href="${esc(agenda)}" style="background:#b5462f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver na agenda</a></p>
  <p style="color:#6b655c;font-size:12px">Enviado pela CorteCerto.</p>
</div>`,
  }
}
