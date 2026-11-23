/** Password rules and Supabase sign-in errors in Portuguese. */
export const MIN_PASSWORD = 8

/** What Supabase's English errors mean, in Portuguese. */
export function authError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('invalid login')) return 'Email ou palavra-passe errados.'
  if (m.includes('email not confirmed')) return 'Ainda não confirmou o email. Abra o link que lhe enviámos.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este email já tem conta. Entre com a palavra-passe ou peça um link.'
  if (m.includes('password')) return `A palavra-passe precisa de pelo menos ${MIN_PASSWORD} caracteres.`
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiadas tentativas. Espere um minuto e tente de novo.'
  return 'Não foi possível. Tente de novo.'
}

