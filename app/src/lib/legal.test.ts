import { expect, it } from 'vitest'
import { DPA, missingAcceptances, TERMS } from './legal'

it('asks for every required document until its current version is accepted', () => {
  expect(missingAcceptances([]).map(d => d.id)).toEqual(['termos', 'tratamento_dados'])
  expect(missingAcceptances([{ document: 'termos', version: TERMS.version }]).map(d => d.id)).toEqual(['tratamento_dados'])
  expect(missingAcceptances([
    { document: 'termos', version: TERMS.version }, { document: 'tratamento_dados', version: DPA.version },
  ])).toEqual([])
})

it('asks again when a document gets a new version', () => {
  expect(missingAcceptances([
    { document: 'termos', version: '2020-01-01' }, { document: 'tratamento_dados', version: DPA.version },
  ]).map(d => d.id)).toEqual(['termos'])
})
