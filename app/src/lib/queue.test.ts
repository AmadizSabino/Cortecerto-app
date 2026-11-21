import { expect, it } from 'vitest'
import { estimateWait, waitText } from './queue'

it('estimates the wait from people ahead, service length and team size', () => {
  expect(estimateWait(0, 30, 1)).toBe(0)
  expect(estimateWait(3, 30, 1)).toBe(90)
  expect(estimateWait(3, 30, 2)).toBe(45)
  expect(estimateWait(1, 22, 1)).toBe(25) // rounded up to 5 minutes
  expect(estimateWait(2, 30, 0)).toBe(60)
})

it('says the wait in words', () => {
  expect(waitText(0)).toBe('É o próximo')
  expect(waitText(25)).toBe('cerca de 25 min')
  expect(waitText(60)).toBe('cerca de 1 h')
  expect(waitText(95)).toBe('cerca de 1 h 35 min')
})
