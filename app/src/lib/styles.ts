import type { SalonType } from './onboarding'

/**
 * Styles to try on a photo with the AI ("antes e depois"), by kind of salon. The salon's own
 * services come first in the list; these add the looks people actually ask for by name.
 */
export const STYLE_PRESETS: Partial<Record<SalonType, string[]>> = {
  barbearia: [
    'Low fade', 'Mid fade', 'High fade', 'Skin fade', 'Taper fade', 'Buzz cut', 'Crew cut', 'French crop',
    'Corte à tesoura', 'Undercut', 'Pompadour', 'Quiff', 'Risca ao lado', 'Mullet moderno',
    'Barba curta desenhada', 'Barba cheia aparada', 'Sem barba',
    'Fade com caracóis', '360 waves', 'Twists', 'Cornrows', 'Locs',
  ],
  cabeleireiro: [
    'Bob', 'Long bob', 'Corte em camadas', 'Franja cortina', 'Pixie', 'Corte reto pelos ombros',
    'Balayage', 'Madeixas loiras', 'Loiro', 'Castanho chocolate', 'Ruivo acobreado', 'Preto', 'Ondulado', 'Liso',
    'Box braids', 'Twists', 'Cornrows', 'Locs', 'Afro', 'Silk press',
  ],
  unhas: ['Gel nude', 'Francesa', 'Vermelho clássico', 'Unhas amendoadas', 'Unhas quadradas', 'Nail art minimalista'],
  sobrancelhas: ['Sobrancelhas definidas', 'Sobrancelhas naturais', 'Laminação de sobrancelhas', 'Extensão de pestanas'],
  maquilhagem: ['Maquilhagem natural', 'Maquilhagem de noite', 'Smokey eyes', 'Batom vermelho'],
}

/** The list for the style picker: the salon's services, then the presets, without repeats. */
export function styleOptions(type: string | null | undefined, services: string[]): string[] {
  const seen = new Set<string>()
  return [...services, ...(STYLE_PRESETS[type as SalonType] ?? [])].filter(s => {
    const k = s.trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k); return true
  })
}
