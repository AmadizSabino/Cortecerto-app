import { expect, it } from 'vitest'
import { emptyWeek, hoursFor, weekToRows } from './schedule'

const salon = [{ weekday: 2, opens: '09:00', closes: '19:00' }]

it('uses the professional own hours when set, the salon hours otherwise', () => {
  const h = { salon, byPro: { ana: [{ weekday: 3, opens: '10:00', closes: '14:00' }], rui: [] } }
  expect(hoursFor(h, 'ana')[0].weekday).toBe(3)
  expect(hoursFor(h, 'rui')).toBe(salon)
  expect(hoursFor(h, undefined)).toBe(salon)
})

it('splits a day with a break into two intervals and reads it back', () => {
  const week = emptyWeek([])
  week[2] = { open: true, opens: '09:00', closes: '19:00', breakFrom: '13:00', breakTo: '14:00' }
  const rows = weekToRows(week)
  expect(rows).toEqual([{ weekday: 2, opens: '09:00', closes: '13:00' }, { weekday: 2, opens: '14:00', closes: '19:00' }])
  expect(emptyWeek(rows as never)[2]).toEqual(week[2])
})

it('rejects a break outside the hours or half filled', () => {
  const week = emptyWeek(salon)
  week[2] = { ...week[2], breakFrom: '20:00', breakTo: '21:00' }
  expect(weekToRows(week)).toBe('A pausa tem de ficar dentro do horário.')
  week[2] = { ...week[2], breakFrom: '13:00', breakTo: '' }
  expect(weekToRows(week)).toBe('Indique o início e o fim da pausa, ou deixe os dois em branco.')
})
