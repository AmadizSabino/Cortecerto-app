import { expect, it } from 'vitest'
import { toCsv } from './csv'

it('writes semicolon CSV with a BOM, quoting where needed', () => {
  const csv = toCsv(['Nome', 'Notas', 'Aceita'], [['João', 'gosta de "degradê"; curto', true], ['Ana', null, false]])
  expect(csv.startsWith('﻿')).toBe(true)
  expect(csv.slice(1)).toBe('Nome;Notas;Aceita\r\nJoão;"gosta de ""degradê""; curto";sim\r\nAna;;não\r\n')
})
