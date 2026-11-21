import { expect, it } from 'vitest'
import { reminderMessage, wantsReminder } from './reminders'

const base = {
  clientName: 'João Silva', serviceName: 'Corte', startsAt: new Date('2026-11-21T10:30:00Z'),
  tz: 'Europe/Lisbon', salonName: 'Barbearia Demo', isTomorrow: true,
}

it('writes the reminder with the first name, day and time in the salon timezone', () => {
  expect(reminderMessage(base)).toBe(
    'Olá João! Lembramos a sua marcação de Corte no Barbearia Demo amanhã, sábado, 21 de novembro, às 10:30. ' +
    'Se não puder vir, responda a esta mensagem para libertarmos a vaga. Até breve!')
})

it('mentions a deposit still owed', () => {
  const t = reminderMessage({ ...base, isTomorrow: false, depositDue: { cents: 500, mbway: '912345678' } }).replace(/\u00a0/g, ' ')
  expect(t.includes('marcação de Corte no Barbearia Demo sábado, 21 de novembro, às 10:30.')).toBe(true)
  expect(t.includes('Falta o sinal de 5,00 € por MB Way para o 912345678.')).toBe(true)
})

it('only reminds bookings that are still on', () => {
  expect(wantsReminder({ status: 'pendente' })).toBe(true)
  expect(wantsReminder({ status: 'confirmada' })).toBe(true)
  expect(wantsReminder({ status: 'cancelada' })).toBe(false)
  expect(wantsReminder({ status: 'faltou' })).toBe(false)
})
