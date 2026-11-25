import type { SalonType } from './onboarding'

/**
 * Style cards ("fichas de estilo"): a reference photo, a short description for the client and a
 * step-by-step for the professional, for the styles of lib/styles.ts (STYLE_PRESETS).
 *
 * Photos: public/estilos/<id>.webp, made once with AI (Gemini), fictional people, never celebrities
 * (image rights, Código Civil art. 79). Each card says the photo is illustrative and AI-made.
 * The step-by-step is a reference written for review by a professional; each one adapts it.
 * Videos: `video` takes an unlisted YouTube id once recorded with a partner salon.
 */
export interface StyleCard {
  id: string
  /** As in STYLE_PRESETS, so the try-on and the cards speak the same language. */
  name: string
  types: SalonType[]
  /** For the client: what it looks like, in one or two sentences. */
  about: string
  /** For the client: who it usually suits. */
  suits: string
  /** For the client: how long it lasts before the next visit. */
  upkeep: string
  /** For the salon: typical time in the chair, in minutes. */
  minutes: number
  /** For the salon: tools and products. */
  tools: string
  /** For the salon: the steps, in order. */
  steps: string[]
  /** Unlisted YouTube video id, when there is one. */
  video?: string
}

const BARBER: SalonType[] = ['barbearia']
const HAIR: SalonType[] = ['cabeleireiro']
const NAILS: SalonType[] = ['unhas']
const BROWS: SalonType[] = ['sobrancelhas', 'estetica', 'maquilhagem']
const MAKEUP: SalonType[] = ['maquilhagem', 'estetica']

export const STYLE_CARDS: StyleCard[] = [
  // Barbearia ----------------------------------------------------------------
  {
    id: 'low-fade', name: 'Low fade', types: BARBER, minutes: 40,
    about: 'Degradé discreto que começa logo acima da orelha e da nuca, com o comprimento de cima livre.',
    suits: 'Quem quer um ar limpo sem mudar muito, e bom para o trabalho.',
    upkeep: '3 a 4 semanas',
    tools: 'Máquina com pentes 0,5 a 3, máquina de acabamentos, tesoura, pente, pó ou pomada mate.',
    steps: [
      'Definir com o cliente o comprimento de cima e até onde sobe o degradé (baixo: 1 a 2 cm acima da orelha).',
      'Cortar as laterais e a nuca com o pente mais comprido (3 ou 2) até à linha do degradé.',
      'Marcar a linha de baixo com o pente 0,5 ou a máquina aberta, à volta da orelha e na nuca.',
      'Esbater a transição com os pentes intermédios (1 e 1,5), em movimentos curtos para fora.',
      'Cortar a parte de cima à tesoura ou com pente comprido e ligar às laterais.',
      'Acabar o contorno com a máquina de acabamentos e pentear com o produto.',
    ],
  },
  {
    id: 'mid-fade', name: 'Mid fade', types: BARBER, minutes: 40,
    about: 'Degradé que começa a meio da cabeça, à altura das têmporas, com laterais curtas e cima com textura.',
    suits: 'Quase todos os formatos de cara. Fica moderno sem ser radical.',
    upkeep: '2 a 3 semanas',
    tools: 'Máquina com pentes 0 a 3, máquina de acabamentos, tesoura, pente, pomada mate.',
    steps: [
      'Combinar o comprimento de cima e a altura do degradé, à linha das têmporas.',
      'Passar o pente 2 ou 3 em todas as laterais e nuca.',
      'Marcar a linha do degradé à altura das têmporas com o pente 1.',
      'Fazer a base com o pente 0 ou 0,5 até 2 a 3 cm acima da orelha.',
      'Esbater cada linha com o pente seguinte e a alavanca da máquina, até não haver marcas.',
      'Cortar e texturizar o cima à tesoura, fazer o contorno e finalizar com pomada.',
    ],
  },
  {
    id: 'high-fade', name: 'High fade', types: BARBER, minutes: 45,
    about: 'Degradé alto, com as laterais muito curtas até perto do alto da cabeça e o cima curto.',
    suits: 'Quem gosta de um visual marcado e desportivo. Realça o cabelo de cima.',
    upkeep: '2 semanas',
    tools: 'Máquina com pentes 0 a 2, máquina de acabamentos ou shaver, tesoura, pente, pomada.',
    steps: [
      'Combinar a altura: o degradé sobe até à curva da cabeça (a linha onde a cabeça começa a arredondar).',
      'Marcar a linha alta com o pente 1 à volta da cabeça.',
      'Fazer a base com o pente 0 até a meio das laterais.',
      'Esbater de baixo para cima com 0,5, 1 e a alavanca, até a transição ficar suave.',
      'Cortar o cima curto à tesoura ou com pente 3 a 4 e ligar à linha do degradé.',
      'Contorno com máquina de acabamentos e finalizar.',
    ],
  },
  {
    id: 'skin-fade', name: 'Skin fade', types: BARBER, minutes: 50,
    about: 'Degradé que começa na pele, rapado em baixo e a subir para cabelo curto, com o cima com textura.',
    suits: 'Quem quer o degradé mais limpo e marcado. Pede manutenção frequente.',
    upkeep: '1 a 2 semanas',
    tools: 'Máquina com pentes 0 a 2, shaver ou máquina sem pente, máquina de acabamentos, tesoura.',
    steps: [
      'Combinar a altura do degradé e o comprimento de cima.',
      'Passar o pente 1 ou 2 em toda a zona do degradé.',
      'Fazer a base na pele com a máquina sem pente ou shaver, até 1 a 2 cm acima da orelha.',
      'Esbater a base com o pente 0 e 0,5, com a alavanca aberta e fechada.',
      'Repassar até não haver linhas, com boa luz e espelho de mão.',
      'Cortar o cima, fazer o contorno e mostrar a nuca ao cliente.',
    ],
  },
  {
    id: 'taper-fade', name: 'Taper fade', types: BARBER, minutes: 35,
    about: 'Só as patilhas e a nuca ficam curtas, em degradé; o resto mantém o comprimento natural.',
    suits: 'Quem quer o cabelo arrumado a crescer bem, sem laterais rapadas.',
    upkeep: '3 a 4 semanas',
    tools: 'Máquina com pentes 0,5 a 2, tesoura, pente, máquina de acabamentos.',
    steps: [
      'Cortar o comprimento geral à tesoura ou com pente comprido.',
      'Na nuca e nas patilhas, fazer a base com o pente 0,5 numa faixa estreita.',
      'Esbater com o pente 1 e 1,5 só nessas zonas, sem subir pelas laterais.',
      'Ligar ao resto do cabelo com a tesoura sobre o pente.',
      'Limpar o contorno da nuca e das orelhas.',
    ],
  },
  {
    id: 'buzz-cut', name: 'Buzz cut', types: BARBER, minutes: 20,
    about: 'Cabelo muito curto e igual em toda a cabeça, feito à máquina.',
    suits: 'Quem quer zero manutenção diária e uma cabeça bem formada.',
    upkeep: '1 a 2 semanas',
    tools: 'Máquina com pente 1 a 3, máquina de acabamentos.',
    steps: [
      'Escolher o pente com o cliente (1, 2 ou 3).',
      'Passar a máquina contra o crescimento em toda a cabeça.',
      'Repassar em várias direções, sobretudo na coroa.',
      'Fazer um pequeno degradé na nuca e nas patilhas, se o cliente quiser.',
      'Contorno limpo na nuca e à volta das orelhas.',
    ],
  },
  {
    id: 'crew-cut', name: 'Crew cut', types: BARBER, minutes: 30,
    about: 'Clássico curto: laterais curtas e cima um pouco mais comprido, levantado à frente.',
    suits: 'Quem quer um corte clássico, prático e fácil de pentear.',
    upkeep: '3 a 4 semanas',
    tools: 'Máquina com pentes 1 a 4, tesoura, pente, pasta leve.',
    steps: [
      'Passar o pente 2 ou 3 nas laterais e na nuca.',
      'Esbater a transição para o cima com o pente 4 ou tesoura sobre o pente.',
      'Cortar o cima à tesoura, mais curto atrás e um pouco mais comprido à frente.',
      'Ligar a frente com a coroa, sem degraus.',
      'Contorno e pentear a frente para cima com pasta.',
    ],
  },
  {
    id: 'french-crop', name: 'French crop', types: BARBER, minutes: 35,
    about: 'Laterais curtas em degradé e cima com textura, penteado para a frente com uma franja curta e reta.',
    suits: 'Rostos ovais ou compridos, e quem tem entradas e quer disfarçá-las.',
    upkeep: '3 semanas',
    tools: 'Máquina com pentes 0,5 a 2, tesoura e tesoura de desbaste, pó texturizante.',
    steps: [
      'Fazer um low ou mid fade nas laterais.',
      'Pentear o cima para a frente e cortar o comprimento à tesoura.',
      'Cortar a franja reta, 1 a 2 cm acima das sobrancelhas.',
      'Dar textura com a tesoura de desbaste ou corte em pontos.',
      'Finalizar com pó texturizante, com os dedos.',
    ],
  },
  {
    id: 'corte-a-tesoura', name: 'Corte à tesoura', types: BARBER, minutes: 40,
    about: 'Corte clássico só à tesoura, natural e com movimento, sem marcas de máquina.',
    suits: 'Quem gosta de cabelo médio e de um ar natural e cuidado.',
    upkeep: '4 a 5 semanas',
    tools: 'Tesoura, tesoura de desbaste, pente, borrifador, creme leve.',
    steps: [
      'Humedecer o cabelo e definir a risca e o comprimento final.',
      'Cortar a nuca e as laterais com a tesoura sobre o pente.',
      'Cortar o cima por secções, com guia do meio para os lados.',
      'Ligar as laterais ao cima, conferindo dos dois lados.',
      'Tirar volume onde for preciso e fazer o contorno à tesoura.',
      'Secar e pentear com creme leve.',
    ],
  },
  {
    id: 'pompadour', name: 'Pompadour', types: BARBER, minutes: 45,
    about: 'Volume à frente, penteado para cima e para trás, com as laterais curtas.',
    suits: 'Quem tem cabelo com algum comprimento em cima e gosta de um visual com estilo.',
    upkeep: '3 a 4 semanas',
    tools: 'Máquina com pentes 1 a 3, tesoura, escova redonda, secador, pomada com brilho.',
    steps: [
      'Fazer um degradé ou laterais curtas, deixando 8 a 12 cm em cima.',
      'Cortar o cima à tesoura, mais comprido à frente e a encurtar para a coroa.',
      'Secar com escova redonda, a levantar a frente para cima e para trás.',
      'Aplicar pomada e moldar o volume com o pente.',
      'Explicar ao cliente como pentear em casa.',
    ],
  },
  {
    id: 'barba-curta-desenhada', name: 'Barba curta desenhada', types: BARBER, minutes: 25,
    about: 'Barba curta e igual, com as linhas das bochechas e do pescoço bem marcadas.',
    suits: 'Quem quer barba sempre arrumada, com um ar cuidado.',
    upkeep: '1 a 2 semanas',
    tools: 'Máquina de barba com pentes 3 a 6 mm, máquina de acabamentos, navalha, toalha quente, óleo.',
    steps: [
      'Pentear a barba e escolher o comprimento com o cliente (3 a 6 mm).',
      'Passar a máquina com o pente escolhido em toda a barba.',
      'Marcar a linha das bochechas, reta ou ligeiramente curva, igual dos dois lados.',
      'Marcar a linha do pescoço a 1 a 2 dedos acima da maçã de Adão.',
      'Toalha quente e perfilar com navalha as linhas marcadas.',
      'Aparar o bigode acima do lábio e terminar com óleo.',
    ],
  },
  {
    id: 'barba-cheia-aparada', name: 'Barba cheia aparada', types: BARBER, minutes: 30,
    about: 'Barba comprida e cheia, com o volume e o formato arranjados, e o bigode aparado.',
    suits: 'Quem tem barba densa e quer mantê-la comprida mas arrumada.',
    upkeep: '2 a 3 semanas',
    tools: 'Tesoura, pente de barba, máquina com pentes, navalha, óleo e bálsamo.',
    steps: [
      'Pentear e definir o formato com o cliente (arredondado, quadrado ou em ponta).',
      'Reduzir o volume das laterais com a máquina e pente comprido, mais curto em cima.',
      'Dar a forma ao queixo à tesoura, sempre com a barba penteada.',
      'Limpar a linha do pescoço e das bochechas, sem subir demasiado.',
      'Aparar o bigode e terminar com óleo e bálsamo.',
    ],
  },
  // Cabeleireiro -------------------------------------------------------------
  {
    id: 'bob', name: 'Bob', types: HAIR, minutes: 45,
    about: 'Corte reto à altura do queixo, com as pontas cheias e um ar moderno.',
    suits: 'Cabelos lisos ou ondulados finos a médios, e rostos ovais ou em coração.',
    upkeep: '6 a 8 semanas',
    tools: 'Tesoura, pente, molas, secador, escova redonda, spray de brilho.',
    steps: [
      'Lavar e pentear, dividir em secções: nuca, laterais e topo.',
      'Cortar a guia na nuca à altura combinada, reta.',
      'Descer as secções sobre a guia e cortar com pouca elevação, para as pontas ficarem cheias.',
      'Cortar as laterais ligando à guia, com a altura do queixo à frente.',
      'Secar com escova redonda e acertar as pontas a seco.',
    ],
  },
  {
    id: 'long-bob', name: 'Long bob', types: HAIR, minutes: 45,
    about: 'Bob mais comprido, entre o queixo e os ombros, fácil de usar liso ou ondulado.',
    suits: 'Quase todos os rostos. Bom para quem quer cortar sem perder muito comprimento.',
    upkeep: '8 a 10 semanas',
    tools: 'Tesoura, pente, molas, secador, escova redonda.',
    steps: [
      'Lavar e dividir em secções.',
      'Cortar a guia na nuca à altura das clavículas.',
      'Cortar as secções sobre a guia, com um ligeiro declive para a frente se a cliente quiser.',
      'Igualar as laterais dos dois lados, com a cliente a olhar em frente.',
      'Secar e acertar a linha a seco.',
    ],
  },
  {
    id: 'corte-em-camadas', name: 'Corte em camadas', types: HAIR, minutes: 50,
    about: 'Cabelo comprido com camadas que dão leveza e movimento, e a moldar o rosto.',
    suits: 'Cabelos grossos ou com muito volume, e quem quer movimento sem cortar o comprimento.',
    upkeep: '8 a 10 semanas',
    tools: 'Tesoura, tesoura de desbaste, pente, molas, secador, escova.',
    steps: [
      'Definir o comprimento final e cortar a linha de base.',
      'Fazer uma guia no topo com a camada mais curta combinada.',
      'Elevar as secções a 90° e cortar ligando à guia do topo.',
      'Fazer as camadas da frente a moldar o rosto, a partir do queixo.',
      'Secar com escova e tirar peso nas pontas se for preciso.',
    ],
  },
  {
    id: 'franja-cortina', name: 'Franja cortina', types: HAIR, minutes: 20,
    about: 'Franja comprida, aberta ao meio, que cai para os lados e se junta ao resto do cabelo.',
    suits: 'Quase todos os rostos, e quem quer mudar sem ter uma franja difícil de pentear.',
    upkeep: '4 a 6 semanas',
    tools: 'Tesoura, pente fino, molas, secador, escova redonda pequena.',
    steps: [
      'Separar uma secção em triângulo no topo da testa.',
      'Cortar o centro mais curto, à altura do nariz ou das maçãs do rosto.',
      'Cortar em diagonal para os lados, a ficar mais comprido.',
      'Suavizar a linha com cortes em ponta.',
      'Secar com escova redonda, para os lados, e mostrar à cliente como fazer em casa.',
    ],
  },
  {
    id: 'pixie', name: 'Pixie', types: HAIR, minutes: 45,
    about: 'Corte curto com textura, mais comprido em cima e curto na nuca e à volta das orelhas.',
    suits: 'Rostos ovais ou com traços finos, e quem quer um corte prático e marcante.',
    upkeep: '4 a 6 semanas',
    tools: 'Tesoura, tesoura de desbaste, máquina com pente, pente, cera ou pasta.',
    steps: [
      'Combinar os comprimentos: nuca, laterais e topo.',
      'Cortar a nuca e à volta das orelhas curto, à tesoura sobre o pente ou máquina.',
      'Cortar o topo com elevação, mais comprido à frente.',
      'Dar textura com cortes em ponta e desbaste.',
      'Finalizar com pasta, com os dedos.',
    ],
  },
  {
    id: 'balayage', name: 'Balayage', types: HAIR, minutes: 150,
    about: 'Madeixas pintadas à mão, mais claras nas pontas, que crescem de forma natural.',
    suits: 'Cabelos médios a compridos, castanhos ou loiros escuros.',
    upkeep: '3 a 4 meses (matização a cada 6 a 8 semanas)',
    tools: 'Descolorante, oxidante 20 ou 30 vol, pincel, papel ou algodão, matizador, tratamento.',
    steps: [
      'Avaliar a base e o histórico de químicos, e fazer o teste de mecha se for preciso.',
      'Dividir o cabelo em secções e escolher as mechas, mais finas junto à raiz.',
      'Aplicar o descolorante à mão, mais carregado nas pontas e esbatido para cima.',
      'Controlar a abertura e enxaguar no tom certo.',
      'Matizar, tratar e secar.',
    ],
  },
  {
    id: 'madeixas-loiras', name: 'Madeixas loiras', types: HAIR, minutes: 150,
    about: 'Madeixas finas loiras desde a raiz, para iluminar o cabelo todo.',
    suits: 'Quem quer clarear sem pintar o cabelo todo. Fica bem em loiros e castanhos claros.',
    upkeep: '2 a 3 meses',
    tools: 'Descolorante, oxidante, papel de alumínio, pente de cauda, matizador.',
    steps: [
      'Avaliar a base e combinar a espessura e quantidade das madeixas.',
      'Fazer as secções e tecer as madeixas finas com o pente de cauda.',
      'Aplicar o descolorante sobre o papel e fechar.',
      'Controlar o tom e enxaguar.',
      'Matizar, tratar e secar.',
    ],
  },
  {
    id: 'castanho-chocolate', name: 'Castanho chocolate', types: HAIR, minutes: 90,
    about: 'Cor castanha quente e intensa, com brilho, igual da raiz às pontas.',
    suits: 'Peles claras a morenas, e quem quer escurecer ou dar brilho à cor natural.',
    upkeep: '5 a 7 semanas (raiz)',
    tools: 'Coloração permanente ou semipermanente, oxidante, pincel, taça, tratamento pós-cor.',
    steps: [
      'Avaliar a base, as brancas e as pontas, e escolher o tom e a fórmula.',
      'Aplicar na raiz primeiro e depois no comprimento, conforme o tempo do produto.',
      'Respeitar o tempo de pausa.',
      'Emulsionar, enxaguar e aplicar o tratamento pós-cor.',
      'Secar e mostrar o brilho à luz.',
    ],
  },
  // Unhas -------------------------------------------------------------------
  {
    id: 'gel-nude', name: 'Gel nude', types: NAILS, minutes: 60,
    about: 'Unhas com verniz de gel num tom nude, brilhante e discreto, que dura semanas.',
    suits: 'Quem quer unhas sempre arranjadas e elegantes, para o dia a dia.',
    upkeep: '3 semanas',
    tools: 'Lima, buffer, empurrador de cutículas, primário, base, gel nude, top coat, lâmpada UV/LED.',
    steps: [
      'Tirar o verniz antigo, limar e dar forma.',
      'Tratar as cutículas e passar o buffer na superfície.',
      'Desidratar e aplicar o primário e a base, e secar na lâmpada.',
      'Aplicar duas camadas finas do nude, secando cada uma.',
      'Top coat, secar, limpar e hidratar as cutículas.',
    ],
  },
  {
    id: 'francesa', name: 'Francesa', types: NAILS, minutes: 70,
    about: 'Unhas com fundo rosado natural e a ponta branca bem desenhada.',
    suits: 'Quem gosta de um clássico elegante que combina com tudo.',
    upkeep: '3 semanas',
    tools: 'Lima, buffer, base, gel rosado, gel branco, pincel fino, top coat, lâmpada.',
    steps: [
      'Preparar as unhas: forma, cutículas, buffer e desidratar.',
      'Base e uma camada de rosado transparente, secar.',
      'Desenhar a ponta branca com pincel fino, em meia-lua, igual em todas.',
      'Secar e corrigir a linha.',
      'Top coat, secar e hidratar.',
    ],
  },
  {
    id: 'vermelho-classico', name: 'Vermelho clássico', types: NAILS, minutes: 60,
    about: 'Unhas vermelhas intensas e brilhantes, o clássico que nunca passa de moda.',
    suits: 'Quem quer dar cor e confiança, para ocasiões ou para o dia a dia.',
    upkeep: '3 semanas',
    tools: 'Lima, buffer, base, gel vermelho, top coat, lâmpada, pincel de limpeza.',
    steps: [
      'Preparar as unhas: forma, cutículas e buffer.',
      'Base e secar.',
      'Duas camadas finas de vermelho, com cuidado junto à cutícula.',
      'Limpar os excessos com pincel antes de secar.',
      'Top coat, secar e hidratar.',
    ],
  },
  {
    id: 'unhas-amendoadas', name: 'Unhas amendoadas', types: NAILS, minutes: 90,
    about: 'Unhas compridas em forma de amêndoa, que alongam os dedos.',
    suits: 'Quem gosta de unhas compridas e femininas.',
    upkeep: '3 a 4 semanas (manutenção)',
    tools: 'Tips ou moldes, gel de construção, lima, buffer, cor à escolha, top coat, lâmpada.',
    steps: [
      'Preparar as unhas naturais.',
      'Aplicar tips ou moldes e construir com gel o comprimento desejado.',
      'Limar em amêndoa: laterais a afunilar e ponta arredondada.',
      'Aplicar a cor escolhida.',
      'Top coat, secar e hidratar.',
    ],
  },
  {
    id: 'nail-art-minimalista', name: 'Nail art minimalista', types: NAILS, minutes: 80,
    about: 'Unhas nude com pequenos detalhes: linhas finas, pontos ou um toque dourado.',
    suits: 'Quem quer algo diferente sem exagerar.',
    upkeep: '3 semanas',
    tools: 'Base, gel nude, géis de cor, pincéis finos, dotting tool, top coat, lâmpada.',
    steps: [
      'Preparar as unhas e aplicar a base nude.',
      'Escolher com a cliente o desenho e em que unhas vai.',
      'Fazer o desenho com pincel fino ou dotting tool, secando cada parte.',
      'Selar com top coat e secar.',
      'Limpar e hidratar.',
    ],
  },
  // Sobrancelhas -------------------------------------------------------------
  {
    id: 'sobrancelhas-definidas', name: 'Sobrancelhas definidas', types: BROWS, minutes: 30,
    about: 'Sobrancelhas com o arco bem desenhado e a forma limpa, a seguir o seu rosto.',
    suits: 'Quem quer um olhar mais marcado e arrumado.',
    upkeep: '3 a 4 semanas',
    tools: 'Lápis de marcação, régua de sobrancelhas, pinça, cera ou linha, tesoura pequena, henna opcional.',
    steps: [
      'Medir o início, o arco e o fim com a régua ou o lápis.',
      'Desenhar a forma com lápis e confirmar com a cliente.',
      'Retirar os pelos fora do desenho com cera, linha ou pinça.',
      'Aparar os pelos compridos com tesoura.',
      'Preencher com henna ou produto, se combinado, e acalmar a pele.',
    ],
  },
  {
    id: 'laminacao-de-sobrancelhas', name: 'Laminação de sobrancelhas', types: BROWS, minutes: 45,
    about: 'Os pelos ficam penteados para cima e fixos, com as sobrancelhas mais cheias.',
    suits: 'Sobrancelhas com falhas ou rebeldes, e quem quer um ar natural e cheio.',
    upkeep: '6 a 8 semanas',
    tools: 'Kit de laminação (loção 1 e 2), película, escovilhão, nutritivo, pinça.',
    steps: [
      'Limpar e desengordurar as sobrancelhas.',
      'Aplicar a loção 1, pentear os pelos para cima e cobrir com película.',
      'Retirar no tempo indicado e aplicar a loção 2.',
      'Retirar, aplicar o nutritivo e pentear.',
      'Depilar os pelos soltos fora da forma.',
    ],
  },
  // Maquilhagem --------------------------------------------------------------
  {
    id: 'maquilhagem-natural', name: 'Maquilhagem natural', types: MAKEUP, minutes: 40,
    about: 'Pele luminosa, olhos suaves e lábios naturais, para parecer descansada e bonita.',
    suits: 'Dia a dia, trabalho, fotografias de dia.',
    upkeep: 'Para um dia',
    tools: 'Hidratante, primer, base leve, corretor, blush, sombras castanhas, máscara, bálsamo ou batom nude.',
    steps: [
      'Limpar e hidratar a pele, e aplicar primer.',
      'Base leve e corretor só onde é preciso.',
      'Sombra castanha suave na pálpebra e máscara.',
      'Blush e iluminador nas maçãs do rosto.',
      'Lábios em tom nude ou rosado.',
    ],
  },
  {
    id: 'maquilhagem-de-noite', name: 'Maquilhagem de noite', types: MAKEUP, minutes: 60,
    about: 'Olhos definidos com eyeliner, pele contornada e lábios intensos, para uma festa ou jantar.',
    suits: 'Eventos, jantares, casamentos à noite.',
    upkeep: 'Para uma noite',
    tools: 'Primer, base de longa duração, corretor, contorno, sombras, eyeliner, pestanas opcionais, batom.',
    steps: [
      'Preparar a pele e aplicar base de longa duração.',
      'Contorno, blush e iluminador.',
      'Sombras mais intensas no canto exterior, esbatidas.',
      'Eyeliner e máscara, ou pestanas postiças.',
      'Lábios em tom intenso e fixar com spray.',
    ],
  },
  {
    id: 'smokey-eyes', name: 'Smokey eyes', types: MAKEUP, minutes: 50,
    about: 'Olhos esfumados em tons escuros, intensos e sedutores, com lábios neutros.',
    suits: 'Noite e eventos. Fica bem em quase todos os formatos de olhos.',
    upkeep: 'Para uma noite',
    tools: 'Primer de olhos, sombras pretas, cinzentas ou castanhas, pincéis de esbater, lápis kajal, máscara.',
    steps: [
      'Primer de olhos e uma sombra de transição.',
      'Sombra escura junto às pestanas, esbatida para cima.',
      'Lápis kajal na linha de água e esbater em baixo.',
      'Limpar os resíduos e fazer a pele no fim.',
      'Máscara em várias camadas e lábios neutros.',
    ],
  },
]

/** The cards for the salon's kinds of work (its type and its other areas), without the ones it hid. */
export function cardsFor(types: string | (string | null | undefined)[], hidden: string[] = []): StyleCard[] {
  const want = new Set((Array.isArray(types) ? types : [types]).filter(Boolean) as string[])
  return STYLE_CARDS.filter(c => c.types.some(t => want.has(t)) && !hidden.includes(c.id))
}

/** The salon's kinds of work: its type first, then the other areas it chose (migration 0022). */
export const salonTypes = (s: { type: string; areas?: string[] | null }) => [s.type, ...(s.areas ?? [])]

export const cardById = (id: string | null | undefined) => STYLE_CARDS.find(c => c.id === id)

export const cardImage = (c: StyleCard) => `/estilos/${c.id}.webp`
