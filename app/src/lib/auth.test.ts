import { expect, it } from 'vitest'
import { authError } from './auth'

it('translates Supabase sign-in errors', () => {
  expect(authError('Invalid login credentials')).toBe('Email ou palavra-passe errados.')
  expect(authError('Email not confirmed')).toContain('confirmou')
  expect(authError('User already registered')).toContain('já tem conta')
  expect(authError('Password should be at least 6 characters')).toContain('8 caracteres')
  expect(authError('something else')).toBe('Não foi possível. Tente de novo.')
})
