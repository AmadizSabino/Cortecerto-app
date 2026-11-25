/** Where the booking was made, in Portuguese: "na barbearia Barba e Beer", "no Salão Rosa", "no estúdio X". */
export function salonAt(s: { name: string; type?: string }): string {
  const n = s.name.trim()
  const KIND: Record<string, string> = { barbearia: 'na barbearia', cabeleireiro: 'no cabeleireiro', unhas: 'no estúdio', estetica: 'no centro de estética', sobrancelhas: 'no estúdio', maquilhagem: 'no estúdio', depilacao: 'no centro', massagem: 'no espaço' }
  const first = n.split(/\s+/)[0].toLowerCase()
  // The name already says what it is ("Barbearia do Zé", "Salão Rosa"): just the article.
  if (['barbearia', 'clínica', 'clinica', 'casa', 'loja', 'academia'].includes(first)) return `na ${n}`
  if (['salão', 'salao', 'espaço', 'espaco', 'estúdio', 'estudio', 'studio', 'atelier', 'instituto', 'centro', 'cabeleireiro'].includes(first)) return `no ${n}`
  return `${KIND[s.type ?? ''] ?? 'no salão'} ${n}`
}
