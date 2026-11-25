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

/** "Construa connosco": what salons that join now get. Francisco to confirm every line. */
export const FOUNDERS = {
  perks: [
    { icon: 'star', title: 'A sua ideia conta', text: 'Diga-nos o que falta. As ideias dos salões passam à frente na lista do que fazemos a seguir, e avisamos quando ficam prontas.' },
    { icon: 'settings', title: 'Configuramos tudo consigo', text: 'No salão ou por videochamada: serviços, preços, horários e a página de marcação.' },
    { icon: 'phone', title: 'Fala com quem faz a app', text: 'Uma dúvida ou uma ideia? Fala comigo por WhatsApp, não com um robô.' },
    { icon: 'tag', title: 'Preço de lançamento para sempre', text: 'Quem entra agora paga 19,90 € + IVA por mês enquanto mantiver a assinatura, mesmo que o preço suba.' },
  ],
}

/** Francisco's own promise, shown with his name. */
export const FOUNDER = {
  name: 'Francisco',
  role: 'Fundador da CorteCerto',
  initials: 'F',
  promises: ['Respondo a cada salão, em português', 'Os dados são sempre seus', 'Sem fidelização nem letras pequenas'],
  quote: 'Criei a CorteCerto depois de ver um amigo barbeiro, em Azeitão, passar o dia a responder a mensagens e a noite a remarcar clientes. As plataformas que existiam cobravam por cada pessoa e ficavam com os clientes. Fiz o contrário: um preço para toda a equipa, os clientes são seus e quem responde sou eu.',
}
