/**
 * Legal documents shown in the app. These are DRAFTS for a lawyer to review
 * before the paid launch. To publish a new version of the terms or the data
 * processing agreement, change its text and its `version` (the date): every
 * salon owner is then asked to accept again.
 * The registered office address is still to add (see COMPANY).
 */

export type LegalId = 'termos' | 'tratamento_dados' | 'privacidade'

export interface LegalSection { heading: string; paragraphs: string[] }
export interface LegalDoc {
  id: LegalId
  path: string
  title: string
  /** "os termos de utilização", "o acordo…": used in "Li e aceito …". */
  withArticle: string
  version: string // YYYY-MM-DD
  intro: string
  sections: LegalSection[]
}

// Registered office address still to add (DL 7/2004, art. 10): Francisco is choosing a domiciliação address.
/** CorteCerto's company, as it appears on payment requests and in the legal texts. */
export const COMPANY_DETAILS = { name: 'Amadiz Sabino Consulting, Lda.', nipc: '510900801', city: 'Setúbal', email: 'admin@cortecerto.pt' }
const COMPANY = `${COMPANY_DETAILS.name}, NIPC ${COMPANY_DETAILS.nipc}, com sede em ${COMPANY_DETAILS.city}, email ${COMPANY_DETAILS.email}`

export const TERMS: LegalDoc = {
  id: 'termos',
  path: '/termos',
  title: 'Termos de utilização',
  withArticle: 'os termos de utilização',
  version: '2026-11-21',
  intro: `Estes termos regem o uso da CorteCerto pelos salões. A CorteCerto é operada por ${COMPANY} ("CorteCerto", "nós").`,
  sections: [
    { heading: '1. O serviço', paragraphs: [
      'A CorteCerto é uma aplicação web para salões (barbearias, cabeleireiros, unhas e depilação) gerirem marcações, clientes e comunicação com os seus clientes.',
      'A conta é criada pelo responsável do salão ("o salão"), que garante ter poderes para aceitar estes termos em nome do negócio.',
    ] },
    { heading: '2. Conta e acesso', paragraphs: [
      'O acesso faz-se por um link enviado para o email do salão. O salão é responsável por manter esse email seguro e por tudo o que for feito com a sua conta.',
      'Cada conta corresponde a um salão. O salão deve manter os dados do negócio corretos e atualizados.',
    ] },
    { heading: '3. Preços e pagamentos dos clientes', paragraphs: [
      'O salão define todos os preços dos seus serviços. A CorteCerto pode sugerir valores, mas a decisão é sempre do salão.',
      'Os sinais pagos pelos clientes vão diretamente para o MB Way do salão. A CorteCerto nunca recebe, guarda ou movimenta dinheiro dos clientes, e não é parte nos contratos entre o salão e os seus clientes.',
    ] },
    { heading: '4. Subscrição', paragraphs: [
      'Durante o período experimental ou o piloto, o uso é gratuito. Antes de qualquer cobrança, o salão é informado do preço e escolhe se quer continuar.',
      'A subscrição é mensal e pode ser cancelada a qualquer momento, produzindo efeitos no fim do mês já pago. As faturas são emitidas pela CorteCerto.',
    ] },
    { heading: '5. Dados dos clientes do salão', paragraphs: [
      'Os dados dos clientes pertencem ao salão, que é o responsável pelo seu tratamento. A CorteCerto trata esses dados apenas por conta do salão, nos termos do Acordo de tratamento de dados, que faz parte destes termos.',
      'O salão compromete-se a só enviar mensagens de promoção a clientes que as tenham aceitado, e a respeitar os pedidos dos clientes sobre os seus dados.',
    ] },
    { heading: '6. Uso aceitável', paragraphs: [
      'O salão não pode usar a CorteCerto para enviar mensagens não pedidas, publicar conteúdos ilegais, fazer-se passar por outra pessoa ou tentar aceder a dados de outros salões.',
      'Podemos suspender uma conta que viole estes termos, avisando o salão sempre que possível.',
    ] },
    { heading: '7. Disponibilidade e responsabilidade', paragraphs: [
      'Fazemos o possível para manter a aplicação disponível e segura, mas não garantimos que funcione sem interrupções. O salão deve manter os seus próprios contactos com os clientes para casos de falha.',
      'Na medida permitida por lei, a responsabilidade da CorteCerto limita-se ao valor pago pelo salão nos 12 meses anteriores. Nada nestes termos limita direitos que a lei não permita limitar.',
    ] },
    { heading: '8. Fim da conta', paragraphs: [
      'O salão pode apagar a conta a qualquer momento. Antes disso pode pedir uma cópia dos seus dados e dos dados dos seus clientes.',
      'Após o fim da conta, os dados são apagados nos prazos previstos no Acordo de tratamento de dados, salvo o que a lei obrigue a guardar, como dados de faturação.',
    ] },
    { heading: '9. Alterações e lei aplicável', paragraphs: [
      'Se alterarmos estes termos, o salão é avisado na aplicação e tem de aceitar a nova versão para continuar a usá-la.',
      'Estes termos regem-se pela lei portuguesa. Para qualquer litígio é competente o foro da comarca de Setúbal, sem prejuízo das regras legais imperativas.',
    ] },
  ],
}

export const DPA: LegalDoc = {
  id: 'tratamento_dados',
  path: '/tratamento-dados',
  title: 'Acordo de tratamento de dados',
  withArticle: 'o acordo de tratamento de dados',
  version: '2026-11-21',
  intro: `Este acordo, previsto no artigo 28.º do Regulamento Geral sobre a Proteção de Dados (RGPD), aplica-se aos dados dos clientes que o salão ("responsável pelo tratamento") guarda na CorteCerto, operada por ${COMPANY} ("subcontratante").`,
  sections: [
    { heading: '1. Objeto', paragraphs: [
      'A CorteCerto trata dados pessoais dos clientes do salão apenas para prestar o serviço: gerir marcações, a lista de clientes, notas, aniversários e o envio de mensagens iniciado pelo salão.',
      'Categorias de dados: nome, telemóvel, histórico de marcações, consentimento para mensagens, notas escritas pelo salão e dia e mês de aniversário. Titulares: clientes do salão.',
    ] },
    { heading: '2. Instruções do salão', paragraphs: [
      'A CorteCerto só trata os dados segundo as instruções do salão, que correspondem ao uso da aplicação. Não usa os dados dos clientes para fins próprios, não os vende e não os partilha com outros salões.',
      'O salão não deve guardar nas notas dados de saúde ou outras categorias especiais, salvo quando necessário para o serviço e com a base legal adequada.',
    ] },
    { heading: '3. Confidencialidade e segurança', paragraphs: [
      'Quem trabalha na CorteCerto e tem acesso aos dados está obrigado a confidencialidade.',
      'Os dados são guardados em centros de dados na União Europeia, com ligações cifradas, acesso por conta e regras na base de dados que impedem um salão de ver dados de outro.',
    ] },
    { heading: '4. Subcontratantes', paragraphs: [
      'O salão autoriza a CorteCerto a usar os seguintes subcontratantes: Supabase (base de dados e autenticação, região UE) e Cloudflare (alojamento da aplicação). Outros serviços, como envio de email, só são acrescentados com aviso prévio ao salão, que pode opor-se.',
      'A CorteCerto impõe a esses subcontratantes obrigações de proteção de dados equivalentes às deste acordo.',
    ] },
    { heading: '5. Direitos dos titulares e apoio ao salão', paragraphs: [
      'A CorteCerto ajuda o salão a responder a pedidos de acesso, retificação, apagamento ou oposição dos clientes, e a cumprir as suas obrigações de segurança e de avaliação de impacto, quando aplicáveis.',
    ] },
    { heading: '6. Violações de dados', paragraphs: [
      'Se houver uma violação de dados pessoais, a CorteCerto avisa o salão sem demora injustificada, e em qualquer caso no prazo de 48 horas depois de dela ter conhecimento, com a informação disponível para o salão poder notificar a CNPD, se necessário.',
    ] },
    { heading: '7. Fim do serviço', paragraphs: [
      'Quando a conta termina, o salão pode pedir uma cópia dos dados nos 30 dias seguintes. Depois disso, a CorteCerto apaga os dados dos clientes no prazo de 60 dias, incluindo cópias de segurança, salvo obrigação legal de os guardar.',
    ] },
    { heading: '8. Auditoria', paragraphs: [
      'A CorteCerto disponibiliza ao salão a informação necessária para demonstrar o cumprimento deste acordo e colabora em auditorias razoáveis, com aviso prévio.',
    ] },
  ],
}

export const PRIVACY: LegalDoc = {
  id: 'privacidade',
  path: '/privacidade',
  title: 'Política de privacidade',
  withArticle: 'a política de privacidade',
  version: '2026-11-21',
  intro: 'Esta política explica que dados são tratados quando marca uma visita através da CorteCerto ou quando um salão usa a aplicação.',
  sections: [
    { heading: '1. Quem é responsável', paragraphs: [
      'Quando marca uma visita, o responsável pelos seus dados é o salão onde marcou. A CorteCerto trata esses dados por conta do salão, como subcontratante.',
      `Para os dados das contas dos salões (email e dados do negócio), a responsável é ${COMPANY}.`,
    ] },
    { heading: '2. Que dados e para quê', paragraphs: [
      'Para marcar: nome, telemóvel, serviço, profissional, dia e hora. Servem para o salão gerir a marcação e contactá-lo sobre ela. Base legal: a execução do serviço que pediu.',
      'Lembretes da sua marcação: o salão pode enviar-lhe por WhatsApp um lembrete da visita que marcou, como parte do serviço. Base legal: a execução do serviço que pediu.',
      'Novidades e promoções do salão por WhatsApp: só se aceitar, na caixa de consentimento, que nunca vem marcada. Pode retirar o consentimento a qualquer momento, pedindo ao salão.',
      'O salão pode guardar notas sobre os serviços que fez e o dia e mês do seu aniversário, para o atender melhor.',
    ] },
    { heading: '3. Com quem partilhamos', paragraphs: [
      'Os seus dados são vistos apenas pelo salão onde marcou. A CorteCerto usa a Supabase (base de dados, União Europeia) e a Cloudflare (alojamento). Não vendemos dados nem os usamos para publicidade.',
      'As mensagens de WhatsApp são enviadas pelo próprio salão, a partir do seu telemóvel. O WhatsApp tem a sua própria política de privacidade.',
    ] },
    { heading: '4. Durante quanto tempo', paragraphs: [
      'Os dados ficam guardados enquanto for cliente do salão. Se não tiver nenhuma marcação durante 3 anos, o seu nome, telemóvel e notas são apagados automaticamente. Os dados das contas dos salões ficam guardados enquanto a conta existir, e os de faturação pelo prazo exigido por lei.',
    ] },
    { heading: '5. Os seus direitos', paragraphs: [
      'Pode pedir acesso, correção ou apagamento dos seus dados, ou opor-se a mensagens de promoção. Faça o pedido ao salão. Se preferir, escreva para admin@cortecerto.pt e reencaminhamos o pedido.',
      'Tem também o direito de apresentar queixa à Comissão Nacional de Proteção de Dados (CNPD), em www.cnpd.pt.',
    ] },
    { heading: '6. Armazenamento no seu browser', paragraphs: [
      'Se escolher um estilo para a página de marcação, essa escolha fica guardada apenas no seu browser. A CorteCerto não usa cookies de publicidade nem de análise.',
      'Para saber quantas pessoas visitam o site e as páginas de marcação, contamos visitas e cliques sem cookies e sem dados pessoais: guardamos a página, o site de onde veio (por exemplo Instagram), o tipo de aparelho e um código que muda todos os dias e não identifica ninguém. O endereço IP não é guardado. A origem da visita fica no browser só enquanto a aba estiver aberta. Se o browser pedir para não ser seguido (Do Not Track), nada é contado.',
    ] },
  ],
}

export const LEGAL_DOCS: LegalDoc[] = [TERMS, DPA, PRIVACY]

/** The documents a salon owner must accept, at their current version. */
export const REQUIRED: LegalDoc[] = [TERMS, DPA]

export interface Acceptance { document: string; version: string }

/** Required documents whose current version the owner has not accepted yet. */
export function missingAcceptances(accepted: Acceptance[]): LegalDoc[] {
  return REQUIRED.filter(d => !accepted.some(a => a.document === d.id && a.version === d.version))
}
