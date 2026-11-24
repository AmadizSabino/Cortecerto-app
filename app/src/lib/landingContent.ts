/**
 * Words on the public landing page (pages/LandingPage.tsx) that Francisco may want to change
 * without touching the layout: testimonials, the founding-salons offer and his own promise.
 */

export type Testimonial = { quote: string; name: string; salon: string; city: string; photo?: string }

/**
 * Real quotes from salons that use CorteCerto, with their permission.
 * Leave it empty until there are real ones: the section is hidden while it is empty.
 * Never invent quotes or names (unfair commercial practice under DL 57/2008).
 */
export const TESTIMONIALS: Testimonial[] = []

/** "Salões fundadores": what the first salons get. Francisco to confirm every line. */
export const FOUNDERS = {
  spots: 20,
  perks: [
    { icon: 'settings', title: 'Configuramos tudo consigo', text: 'No salão ou por videochamada: serviços, preços, horários e a página de marcação.' },
    { icon: 'tag', title: 'Preço de lançamento para sempre', text: 'Paga 19,90 € + IVA por mês enquanto mantiver a assinatura, mesmo que o preço suba.' },
    { icon: 'phone', title: 'Linha direta com o fundador', text: 'Uma dúvida ou um problema? Fala comigo por WhatsApp, não com um robô.' },
    { icon: 'star', title: 'As suas ideias primeiro', text: 'O que pedir entra à frente na lista do que vamos fazer a seguir.' },
  ],
}

/** Francisco's own promise, shown with his name. */
export const FOUNDER = {
  name: 'Francisco',
  role: 'Fundador da CorteCerto',
  initials: 'F',
  promises: ['Respondo a cada salão, em português', 'Os dados são sempre seus', 'Sem fidelização nem letras pequenas'],
  quote: 'Criei a CorteCerto depois de ver barbeiros a perder dinheiro com cadeiras vazias e cadernos cheios de riscos. A app tem de lhe poupar tempo logo na primeira semana. Se não poupar, não paga nada: os primeiros 30 dias são grátis e não pedimos cartão.',
}
