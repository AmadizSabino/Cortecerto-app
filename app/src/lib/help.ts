import { can, type NEED, type Role } from './access'

/**
 * "Ajuda": short how-tos for the salon panel, in plain Portuguese.
 * Each screen links to its own topics with a "?" (HelpLink), and /ajuda lists them all.
 * A topic is 3 to 6 steps, written so it can also be sent by WhatsApp to someone on the team.
 * Use the words on the buttons exactly, so people can find them on the screen.
 */

export interface HelpTopic {
  id: string
  group: string
  title: string
  /** The panel screen this is about: the "?" on that screen opens these topics. */
  screen?: string
  /** Who sees it: the same levels as the screen itself. */
  need: keyof typeof NEED
  steps: string[]
  tip?: string
  /** Extra words people might search for. */
  words?: string
}

export const HELP_GROUPS = ['Começar', 'A agenda', 'Clientes', 'No salão', 'Promoções e vendas', 'Gestão do salão', 'Conta e assinatura'] as const

export const SCREEN_LABEL: Record<string, string> = {
  '/painel': 'Hoje', '/semana': 'Semana', '/clientes': 'Clientes', '/mais': 'Mais', '/lembretes': 'Lembretes', '/fila': 'Fila de espera',
  '/poster': 'Poster com QR', '/convidar': 'Convidar clientes', '/clube': 'Clube', '/pacotes': 'Pacotes', '/promocoes': 'Social Media Manager',
  '/ia': 'Assistente IA', '/estilos': 'Estilos', '/loja': 'Loja', '/definicoes': 'Definições', '/horarios': 'Horários e folgas', '/equipa': 'Equipa', '/precos': 'Preços por profissional',
  '/estatisticas': 'Estatísticas', '/marca': 'Marca e galeria', '/domicilio': 'Ao domicílio', '/assinatura': 'Assinatura', '/palavra-passe': 'Palavra-passe',
}

export const HELP: HelpTopic[] = [
  // Começar
  {
    id: 'instalar', group: 'Começar', title: 'Pôr a app no ecrã do telemóvel', screen: '/mais', need: 'agenda', words: 'instalar ícone iphone android',
    steps: [
      'Abra o painel no telemóvel e toque em Mais.',
      'Em "App no telemóvel", toque em Instalar.',
      'No Android (Chrome), confirme em Instalar. No iPhone (Safari), toque no botão Partilhar e depois em "Adicionar ao ecrã principal".',
      'A partir daí abra a CorteCerto pelo ícone, como qualquer outra app. Fica com a sessão iniciada.',
    ],
    tip: 'Para a sua equipa, envie o link /app (por exemplo cortecerto.pt/app): mostra o passo certo para cada telemóvel. No iPhone, abra-o no Safari.',
  },
  {
    id: 'avisos', group: 'Começar', title: 'Receber um aviso no telemóvel a cada marcação', screen: '/painel', need: 'agenda', words: 'notificação aviso alerta som telemóvel nova marcação',
    steps: [
      'No Hoje, toque em "Ligar avisos" no cartão "Saiba logo quando entra uma marcação". Também está em Mais > Definições > Avisos no telemóvel.',
      'Quando o telemóvel perguntar, toque em Permitir.',
      'A partir daí, cada marcação online, ou feita por alguém da equipa no painel, aparece no ecrã do telemóvel, com a contagem do dia. As que faz no seu próprio telemóvel não geram aviso.',
      'Para desligar, volte a Definições > Avisos no telemóvel.',
    ],
    tip: 'No iPhone, os avisos só funcionam com a app no ecrã principal (iOS 16.4 ou mais recente). Os valores em euros só aparecem no aviso do dono. Cada pessoa da equipa liga os avisos no seu próprio telemóvel.',
  },
  {
    id: 'entrar', group: 'Começar', title: 'Entrar na conta e mudar a palavra-passe', screen: '/palavra-passe', need: 'agenda', words: 'login sessão esqueci password',
    steps: [
      'Abra a app ou o endereço do painel e escreva o email e a palavra-passe.',
      'Esqueceu-se? Toque em "Esqueci-me da palavra-passe": recebe um link por email para escolher uma nova.',
      'Também pode tocar em "Entrar com link por email" e entrar pelo link, sem palavra-passe.',
      'Para mudar a palavra-passe: Mais › Palavra-passe.',
    ],
  },
  {
    id: 'link', group: 'Começar', title: 'Partilhar o link de marcação', screen: '/mais', need: 'agenda', words: 'instagram bio google whatsapp estado partilhar',
    steps: [
      'Toque em Mais. O link de marcação do salão está no topo.',
      'Toque em Copiar e cole-o na bio do Instagram, no perfil do Google e no Estado do WhatsApp.',
      'Toque em "Ver como cliente" para ver a página tal como os clientes a veem.',
      'No balcão e no espelho, use o Poster com QR (Mais › Poster com QR).',
    ],
    tip: 'Quanto mais clientes marcarem pelo link, menos tempo passa ao telefone.',
  },
  {
    id: 'primeiros-passos', group: 'Começar', title: 'Primeiros passos', screen: '/painel', need: 'definicoes', words: 'configurar começar checklist',
    steps: [
      'No separador Hoje, o cartão "Primeiros passos" mostra o que falta configurar.',
      'Toque em Configurar ao lado de cada passo: abre o ecrã certo.',
      'Nos passos que se fazem fora da app (por exemplo, pôr o link no Instagram), toque em "Já fiz".',
      'Quando estiver tudo feito, o cartão desaparece. Pode também tocar em Esconder.',
    ],
  },

  // A agenda
  {
    id: 'nova-marcacao', group: 'A agenda', title: 'Marcar um cliente que ligou ou passou no balcão', screen: '/painel', need: 'agenda', words: 'nova marcação telefone balcão adicionar',
    steps: [
      'No separador Hoje, toque no botão "+ Marcação" (em baixo, à direita).',
      'Escreva o nome do cliente e, se tiver, o telemóvel.',
      'Escolha o serviço, o profissional e o dia.',
      'Toque num dos horários livres (ou escreva outra hora) e guarde.',
      'Com o telemóvel preenchido, o botão WhatsApp da marcação envia a confirmação já escrita.',
    ],
  },
  {
    id: 'confirmar', group: 'A agenda', title: 'Confirmar marcações online e sinais', screen: '/painel', need: 'agenda', words: 'pendente por confirmar mbway sinal pago',
    steps: [
      'As marcações feitas pelo link aparecem sozinhas na agenda (a app atualiza a cada minuto).',
      'As que estão "Por confirmar" têm o botão Confirmar.',
      'Se pediu sinal, confirme no MB Way que recebeu e toque em "marcar como recebido". A marcação fica confirmada.',
      'Toque em WhatsApp para enviar ao cliente a confirmação já escrita.',
    ],
    tip: 'No topo de Hoje vê quantos sinais ainda estão por confirmar.',
  },
  {
    id: 'estados', group: 'A agenda', title: 'Marcar como concluída, faltou ou cancelada', screen: '/painel', need: 'agenda', words: 'concluída faltou falta cancelar estado',
    steps: [
      'Depois do serviço, toque em Concluída. A app propõe logo a próxima visita do cliente.',
      'Se o cliente não apareceu, toque em Faltou. Fica registado na ficha e nas estatísticas.',
      'Se a marcação não se vai fazer, toque em Cancelar.',
      'Depois de Faltou ou Cancelar, se ainda houver tempo, aparece "Oferecer a vaga".',
    ],
  },
  {
    id: 'proxima-visita', group: 'A agenda', title: 'Marcar já a próxima visita', screen: '/painel', need: 'agenda', words: 'próxima visita repetir semanas',
    steps: [
      'Ao tocar em Concluída, abre "Marcar a próxima visita" (ou toque em "Próxima visita" na marcação).',
      'Escolha daqui a quantas semanas e um horário livre.',
      'Marque e toque em "Enviar por WhatsApp" para o cliente ficar com a data.',
    ],
    tip: 'É o melhor momento para marcar: o cliente ainda está na cadeira.',
  },
  {
    id: 'mudar-hora', group: 'A agenda', title: 'Mudar a hora de uma marcação', screen: '/painel', need: 'agenda', words: 'editar alterar mudar hora sugerir horário',
    steps: [
      'Já combinou com o cliente? Toque em Editar na marcação, mude o dia ou a hora e guarde.',
      'Quer que seja o cliente a decidir? Toque em "Sugerir outro horário" e escolha a nova hora.',
      'Toque em "Enviar por WhatsApp": o cliente recebe um link para aceitar ou recusar.',
      'Até ele responder, a marcação fica onde estava e o novo horário fica guardado para ele. A resposta aparece na marcação.',
      'Mudou de ideias? Toque em "Retirar sugestão".',
    ],
  },
  {
    id: 'pedidos-horario', group: 'A agenda', title: 'Responder a um pedido de horário ocupado', screen: '/painel', need: 'agenda', words: 'pedido horário ocupado lista de espera trocar mudar cliente encaixar',
    steps: [
      'Na página de marcação, os horários ocupados aparecem riscados, ao lado dos livres. O cliente toca no que quer (e numa 2.ª opção) e envia o pedido. Recebe um aviso no telemóvel e o pedido aparece no Hoje, em "Pedidos de horário".',
      'Até lhe responder, o cliente fica na lista de espera. Em cada hora pedida vê quem lá está. Toque em "Pedir a … para mudar" para lhe perguntar por WhatsApp, ou em "Mudar … de hora" para lhe enviar um novo horário com link.',
      'Quando a hora ficar livre, toque em "Dar 15:00 a …" e depois em "Enviar por WhatsApp" para o avisar. Fica marcado e confirmado.',
      'Não dá? Toque em "Propor outro horário": o horário fica guardado para o cliente, que aceita com um toque no link. Se disser que não, volta à lista de espera.',
      'Não consegue mesmo? Toque em Recusar e envie a mensagem.',
    ],
    tip: 'Se o cliente marcar outro horário nesse dia, o pedido sai sozinho da lista. As mensagens saem do seu WhatsApp: não há envios automáticos nem custos.',
  },
  {
    id: 'oferecer-vaga', group: 'A agenda', title: 'Preencher uma vaga que ficou livre', screen: '/painel', need: 'agenda', words: 'vaga livre cancelou faltou oferecer',
    steps: [
      'Numa marcação cancelada ou com falta, toque em "Oferecer a vaga".',
      'A app mostra clientes a quem a vaga pode interessar: marcados mais tarde ou clientes habituais que aceitaram mensagens.',
      'Toque em cada um para enviar a vaga por WhatsApp. Também pode copiar o link para o Estado ou o Instagram.',
      'O primeiro a aceitar fica com a vaga e a agenda atualiza sozinha.',
    ],
  },
  {
    id: 'semana', group: 'A agenda', title: 'Ver a semana', screen: '/semana', need: 'semana', words: 'semana calendário vista',
    steps: [
      'Toque no separador Semana.',
      'Use as setas para mudar de semana e "Voltar a esta semana" para regressar.',
      'Toque no nome de um profissional para ver só as marcações dele.',
      'Toque num dia para abrir esse dia na agenda.',
    ],
  },
  {
    id: 'lembretes', group: 'A agenda', title: 'Enviar os lembretes da véspera', screen: '/lembretes', need: 'lembretes', words: 'lembrete véspera amanhã aviso whatsapp',
    steps: [
      'No separador Hoje, o cartão de lembretes mostra quantos faltam enviar. Toque em "Enviar ›" (ou Mais › Lembretes).',
      'Para cada cliente "Por enviar", toque em WhatsApp: a mensagem já vem escrita, só tem de enviar.',
      'Avisou o cliente de outra forma? Toque em "Já avisei de outra forma".',
      'Se o cliente responder que não pode vir, cancele a marcação e ofereça a vaga.',
    ],
    tip: 'Leva 2 minutos ao fim do dia e é o que mais reduz as faltas.',
  },
  {
    id: 'fila', group: 'A agenda', title: 'Usar a fila de espera', screen: '/fila', need: 'fila', words: 'fila sem marcação chegada walk-in',
    steps: [
      'Abra Mais › Fila de espera.',
      'Quem chega ao balcão: escreva o nome (e o telemóvel, se quiser) e toque em "Adicionar à fila".',
      'Os clientes também se juntam sozinhos pelo QR do "Poster com QR da fila".',
      'Toque em "Avisar que está quase" para mandar um WhatsApp, depois em Chamar, e no fim em Atendido (ou Saiu, se foi embora).',
    ],
  },

  // Clientes
  {
    id: 'clientes', group: 'Clientes', title: 'Encontrar um cliente e ver o histórico', screen: '/clientes', need: 'clientes', words: 'procurar ficha histórico notas aniversário',
    steps: [
      'Toque no separador Clientes e escreva o nome ou o telemóvel em Procurar.',
      'Toque no cliente para ver as visitas, as faltas e as notas.',
      'Toque em "Editar registo" para juntar notas (por exemplo, o corte que prefere) e o dia de anos.',
    ],
  },
  {
    id: 'tempo-cliente', group: 'Clientes', title: 'Dar mais tempo a um cliente que demora mais', screen: '/clientes', need: 'clientes', words: 'tempo duração minutos demora mais cabelo comprido cliente lento',
    steps: [
      'Em Clientes, toque no cliente e depois em "Definir", em "Tempo de …".',
      'Escolha o serviço e quanto tempo esse cliente demora (por exemplo, Corte: 60 min). Ou escolha "Todos os serviços" e os minutos a mais.',
      'Toque em Guardar. Quando ele marcar online, a agenda guarda esse tempo sozinha. O cliente continua a ver só o serviço.',
      'Só para uma marcação? No Hoje, toque em Editar na marcação e mude a Duração.',
    ],
  },
  {
    id: 'cliente-novo', group: 'Clientes', title: 'Registar um cliente novo', screen: '/clientes', need: 'clientes', words: 'novo cliente registar adicionar lista',
    steps: [
      'Em Clientes, toque em "Novo cliente".',
      'Escreva o nome e o telemóvel e guarde. Depois pode juntar notas e o aniversário.',
      'Quando alguém novo marca pela primeira vez, a agenda pergunta "Cliente novo. Quer adicionar?". Toque em "Sim, adicionar".',
    ],
  },
  {
    id: 'voltar', group: 'Clientes', title: 'Chamar clientes que não voltam e dar os parabéns', screen: '/clientes', need: 'clientes', words: 'em risco aniversário parabéns voltar',
    steps: [
      'Em Clientes, toque em "Em risco": são os clientes que já deviam ter voltado.',
      'Toque em "Convidar a voltar" para abrir o WhatsApp com uma mensagem pronta.',
      'Em "Aniversário" vê quem faz anos. Toque em "Dar os parabéns".',
    ],
  },
  {
    id: 'convidar', group: 'Clientes', title: 'Convidar clientes a marcar online', screen: '/convidar', need: 'convidar', words: 'convite contactos enviar link',
    steps: [
      'Abra Mais › Convidar clientes.',
      'Toque em "Escolher dos contactos" (ou escreva o nome e o número).',
      'Toque em cada pessoa: abre o WhatsApp com o convite e o link já escritos.',
      'Cada convidado fica na sua lista de clientes.',
    ],
  },
  {
    id: 'apagar-cliente', group: 'Clientes', title: 'Apagar os dados de um cliente que o pediu', screen: '/clientes', need: 'apagarCliente', words: 'rgpd apagar dados privacidade',
    steps: [
      'Em Clientes, abra o cliente.',
      'Toque em "Apagar dados deste cliente (pedido RGPD)" e confirme.',
      'O nome e o telemóvel deixam de aparecer nas marcações antigas. Não dá para desfazer.',
    ],
    tip: 'Só o dono do salão pode fazer isto.',
  },

  // No salão
  {
    id: 'poster', group: 'No salão', title: 'Imprimir o poster com QR', screen: '/poster', need: 'poster', words: 'qr imprimir cartaz espelho porta',
    steps: [
      'Abra Mais › Poster com QR.',
      'Toque em Imprimir (ou guarde em PDF e imprima numa loja).',
      'Ponha-o no espelho, no balcão ou na porta. Quem ler o QR com a câmara abre a sua página de marcação.',
    ],
  },
  {
    id: 'clube', group: 'Promoções e vendas', title: 'Criar o Clube e juntar membros', screen: '/clube', need: 'clube', words: 'clube mensalidade membros subscrição',
    steps: [
      'Abra Mais › Clube. Dê um nome, o preço por mês e os benefícios, e guarde.',
      'Ligue "Mostrar o Clube na página de marcação" para os clientes pedirem para aderir.',
      'Os pedidos aparecem na lista de Membros. Quando o cliente pagar, toque em "Pagamento recebido: ativar".',
      'Todos os meses, quando pagar, toque em "Pagou mais um mês".',
      'Quem paga no balcão: use "Juntar um cliente".',
    ],
    tip: 'O cliente paga a mensalidade diretamente ao salão (MB Way ou balcão). A CorteCerto não fica com nada.',
  },
  {
    id: 'loja', group: 'Promoções e vendas', title: 'Pôr produtos à venda na loja', screen: '/loja', need: 'lojaProdutos', words: 'loja produtos vender pomada champô óleo foto preço esgotado',
    steps: [
      'Abra Mais › Loja e toque em "Adicionar produto".',
      'Escolha uma foto, escreva o nome e o preço. A descrição é opcional.',
      'Em "Como o cliente paga", escolha "Paga no salão ao levantar" ou "Paga antes por MB WAY" (precisa do número MB WAY em Definições).',
      'Em "Lembrar a reposição", escolha daqui a quantas semanas o produto costuma acabar. Toque em Guardar.',
      'O produto aparece logo na sua página, no separador Loja. Acabou o stock? Toque em Editar e marque Esgotado.',
    ],
    tip: 'O preço é sempre seu. O cliente paga diretamente ao salão: a CorteCerto não fica com nada.',
  },
  {
    id: 'loja-stock', group: 'Promoções e vendas', title: 'Contar o stock dos produtos', screen: '/loja', need: 'loja', words: 'stock inventário unidades esgotado encomendar chegou parado',
    steps: [
      'Em Mais › Loja, toque em Editar num produto e ligue "Contar o stock". Escreva quantas unidades tem no salão e com quantas quer o aviso.',
      'A cada venda entregue (reserva ou balcão), a app tira as unidades. Uma reserva por levantar fica guardada para esse cliente.',
      'Quando sobram poucas, o produto aparece em "Pouco stock", na Loja e em Hoje. Com 0, aparece Esgotado na sua página.',
      'Chegou uma encomenda? Toque em "Chegou stock" (ou no + ao lado do produto) e escreva quantas unidades chegaram.',
      'Em "Como estão a vender" vê o que vende mais, para quantas semanas chega o stock e o que está parado.',
    ],
    tip: 'Contar o stock é opcional: um produto sem esta opção vende-se como antes, sem contas.',
  },
  {
    id: 'loja-reservas', group: 'Promoções e vendas', title: 'Entregar reservas e vender no balcão', screen: '/loja', need: 'loja', words: 'loja reserva levantar entregue mb way balcão venda',
    steps: [
      'Quando um cliente reserva, recebe um aviso no telemóvel e a reserva aparece em Hoje e em Mais › Loja › "Reservas por levantar".',
      'Pagamento por MB WAY: quando o dinheiro chegar, toque em "MB WAY recebido".',
      'Quando o cliente levar o produto, toque em "Entregue e pago" (ou "Entregue", se já pagou).',
      'Vendeu um produto no salão sem reserva? Use "Vender no balcão". Com o telemóvel do cliente, a app lembra a reposição.',
      'O cliente desistiu? Toque em Cancelar.',
    ],
    tip: 'As vendas da loja aparecem nas Estatísticas (só o dono vê os valores) e em Clientes, no filtro "Compraram na loja".',
  },
  {
    id: 'loja-partilhar', group: 'Promoções e vendas', title: 'Partilhar a loja e lembrar a reposição', screen: '/loja', need: 'loja', words: 'loja link partilhar qr poster reposição lembrete whatsapp',
    steps: [
      'Em Mais › Loja, toque em "Partilhar a loja" para enviar o link por WhatsApp, ou em "Copiar link" para a bio do Instagram.',
      'Toque em "Poster com QR" e imprima: ponha junto aos produtos ou no espelho. O cliente lê o código e reserva.',
      'Depois de marcar, o cliente também vê "Quer levar alguma coisa na visita?" com os seus produtos.',
      'Algumas semanas depois de uma compra, o cliente aparece em "Lembrar a reposição". Toque em "Enviar lembrete": abre o WhatsApp com a mensagem pronta.',
    ],
    tip: 'O lembrete nunca é enviado sozinho: é sempre o salão que toca para enviar.',
  },
  {
    id: 'pacotes', group: 'Promoções e vendas', title: 'Vender pacotes e packs de sessões', screen: '/pacotes', need: 'pacotes', words: 'pacote pack casamento evento combo sessões',
    steps: [
      'Abra Mais › Pacotes e crie um pacote: nome, descrição, preço e, se for um pack, o número de sessões e a validade.',
      'Os pacotes aparecem na sua página de marcação.',
      'Pedidos de casamentos e eventos aparecem em Pedidos: faça a proposta com o preço e o sinal e envie por WhatsApp.',
      'Os packs que vendeu estão em "Packs vendidos". Na agenda, toque em "Usar sessão do pack" quando o cliente vier.',
    ],
  },
  {
    id: 'promocoes', group: 'Promoções e vendas', title: 'Criar uma promoção e o post para as redes', screen: '/promocoes', need: 'promocoes', words: 'promoção desconto post instagram horas calmas',
    steps: [
      'Abra Mais › Social Media Manager. Em "Esta semana" vê as horas calmas e as datas especiais.',
      'Toque em "Criar esta promoção" (ou "Nova promoção") e escolha o tipo, os serviços, os dias e as horas.',
      'A app escreve o texto do post e faz a imagem com o seu logótipo e as suas fotos.',
      'Copie o texto, guarde a imagem e publique no Instagram ou no Estado do WhatsApp.',
    ],
    tip: 'Uma oferta só nas horas calmas vale mais do que descontos o tempo todo.',
  },
  {
    id: 'antes-depois', group: 'Promoções e vendas', title: 'Mostrar ao cliente o antes e depois', screen: '/painel', need: 'clientes', words: 'antes depois ia foto estilo corte simular',
    steps: [
      'Em Hoje, na marcação do cliente, toque em "Antes e depois".',
      'Toque em "Tirar foto" (ou "Escolher foto" para usar uma que já tem).',
      'Escolha o estilo. Começa no serviço marcado; há também estilos como fades ou pompadour, ou "Outro" para escrever o que o cliente quer.',
      'Toque em "Ver o depois". Em cerca de 10 segundos aparece a foto com o novo visual, ao lado da original.',
    ],
    tip: 'A foto não é guardada. Também pode usar em Mais › Assistente IA ou na ficha do cliente.',
  },
  {
    id: 'estilos', group: 'No salão', title: 'Ver as fichas de estilo e escolher o que os clientes veem', screen: '/estilos', need: 'estilos', words: 'estilo ficha corte fade barba unhas maquilhagem foto passo a passo vídeo inspiração',
    steps: [
      'Abra Mais › Estilos. Aparecem os estilos do seu tipo de salão, cada um com uma foto.',
      'Toque num estilo para ver para quem é, quanto dura, o tempo, o material e o passo a passo.',
      'Para mostrar ao cliente como fica, toque em "Antes e depois com um cliente".',
      'Se não faz um estilo, desligue "Mostrar este estilo aos clientes". Deixa de aparecer na sua página de marcação.',
      'Quando um cliente escolhe um estilo ao marcar, aparece em Hoje, na marcação: "Escolheu o estilo …". Toque para abrir a ficha.',
    ],
    tip: 'As fotos são ilustrativas, criadas por IA, e não são pessoas reais. O passo a passo é uma referência: cada profissional adapta-o ao cliente. Só o dono e quem tem acesso Gestor podem esconder estilos. Os vídeos chegam aos poucos.',
  },
  {
    id: 'ia', group: 'Promoções e vendas', title: 'Usar o Assistente IA', screen: '/ia', need: 'ia', words: 'ia inteligência artificial antes depois relatório',
    steps: [
      'Abra Mais › Assistente IA.',
      'Toque na função que quer usar e siga os passos no ecrã.',
      'Toque em Copiar para usar o resultado numa mensagem ou num post.',
    ],
    tip: 'Os telemóveis e emails dos clientes nunca são enviados à IA, e os nomes são trocados por códigos. Os valores em euros só aparecem ao dono.',
  },

  // Gestão do salão
  {
    id: 'servicos', group: 'Gestão do salão', title: 'Mudar serviços, preços e durações', screen: '/definicoes', need: 'definicoes', words: 'serviço preço duração minutos novo serviço',
    steps: [
      'Abra Mais › Definições e desça até "Serviços e preços".',
      'Mude o nome, os minutos ou o preço. Para um serviço novo, toque em "+ Adicionar serviço".',
      'Desligue Ativo num serviço que já não faz: deixa de aparecer aos clientes.',
      'Toque em "Guardar alterações".',
    ],
    tip: 'Cada profissional cobra diferente? Use Mais › Preços por profissional.',
  },
  {
    id: 'horario', group: 'Gestão do salão', title: 'Mudar o horário de abertura', screen: '/definicoes', need: 'definicoes', words: 'horário abertura fecho dias',
    steps: [
      'Abra Mais › Definições e desça até Horário.',
      'Para cada dia, mude as horas de abrir e fechar, ou marque Fechado.',
      'Toque em "Guardar alterações". Os clientes só veem horários livres dentro deste horário.',
    ],
  },
  {
    id: 'folgas', group: 'Gestão do salão', title: 'Folgas, férias, feriados e pausas', screen: '/horarios', need: 'horarios', words: 'folga férias feriado fechar bloquear pausa almoço',
    steps: [
      'Abra Mais › Horários e folgas.',
      'Em "Folgas, férias e bloqueios", escolha quem (um profissional ou "Todo o salão").',
      'Escolha dias inteiros ou algumas horas, as datas, e toque em "Adicionar bloqueio".',
      'Para um profissional com horário diferente do salão (ou com pausa de almoço), toque em Alterar no nome dele.',
    ],
    tip: 'Ninguém consegue marcar online num bloqueio. As marcações que já existem ficam: avise esses clientes.',
  },
  {
    id: 'equipa', group: 'Gestão do salão', title: 'Adicionar um profissional e as comissões', screen: '/equipa', need: 'equipa', words: 'profissional barbeiro funcionário comissão',
    steps: [
      'Abra Mais › Equipa.',
      'Toque em "+ Adicionar profissional", escreva o nome e, se quiser, a percentagem de comissão.',
      'Desligue Ativo para quem saiu: deixa de aparecer aos clientes, mas o histórico fica.',
      'As comissões de cada mês estão em Estatísticas (só o dono vê).',
    ],
  },
  {
    id: 'acessos', group: 'Gestão do salão', title: 'Dar acesso ao painel a alguém da equipa', screen: '/equipa', need: 'acessos', words: 'acesso convite equipa nível receção gestor',
    steps: [
      'Abra Mais › Equipa e desça até "Dar acesso".',
      'Escreva o email da pessoa e escolha o nível: Agenda (só marcações), Receção (também clientes e Clube) ou Gestor (também estatísticas, preços e horários).',
      'Toque em "Criar convite" e depois em "Avisar por WhatsApp" para lhe enviar o link.',
      'Para tirar o acesso, toque em "Tirar acesso" em "Com acesso".',
    ],
    tip: 'Só o dono vê as definições do salão, a assinatura e pode exportar ou apagar dados.',
  },
  {
    id: 'precos', group: 'Gestão do salão', title: 'Preços diferentes por profissional', screen: '/precos', need: 'precos', words: 'preço profissional diferente sénior',
    steps: [
      'Abra Mais › Preços por profissional.',
      'Escreva o preço ou os minutos de quem cobra diferente. Em branco usa o valor do serviço.',
      'Marque "Não faz" para quem não faz esse serviço: deixa de aparecer na marcação.',
    ],
  },
  {
    id: 'sinal', group: 'Gestão do salão', title: 'Pedir sinal por MB Way', screen: '/definicoes', need: 'definicoes', words: 'sinal mbway depósito faltas pagar',
    steps: [
      'Abra Mais › Definições.',
      'Em "Sinal por marcação (€)" escreva o valor (0 = sem sinal) e o seu número MB Way.',
      'Toque em "Guardar alterações". Os clientes veem o valor e o número quando marcam online.',
      'Quando receber o MB Way, toque em "marcar como recebido" na marcação.',
    ],
    tip: 'Um sinal pequeno (por exemplo 5 €) reduz muito as faltas.',
  },
  {
    id: 'cancelar-online', group: 'Gestão do salão', title: 'Deixar os clientes mudar ou cancelar online', screen: '/definicoes', need: 'definicoes', words: 'cancelar mudar cliente link antecedência',
    steps: [
      'Abra Mais › Definições.',
      'Em "Clientes podem cancelar ou mudar online", escolha até quantas horas antes.',
      'Toque em "Guardar alterações". A confirmação por WhatsApp passa a levar um link para o cliente mudar ou cancelar sozinho.',
      'Na agenda vê "Cliente mudou a hora" ou "Cancelada pelo cliente".',
    ],
  },
  {
    id: 'estatisticas', group: 'Gestão do salão', title: 'Ver quanto faturou', screen: '/estatisticas', need: 'estatisticas', words: 'faturação dinheiro estatísticas comissões relatório',
    steps: [
      'Abra Mais › Estatísticas e escolha o período.',
      'Vê o faturado, as visitas, o valor médio, as faltas e os clientes novos.',
      'Mais abaixo: os serviços mais feitos, cada profissional, as comissões e os dias com mais movimento.',
    ],
    tip: 'Conta só as visitas marcadas como Concluída. Marque-as na agenda para os números estarem certos.',
  },
  {
    id: 'marca', group: 'Gestão do salão', title: 'Pôr o logótipo, a capa e fotos do seu trabalho', screen: '/marca', need: 'equipa', words: 'logótipo foto galeria capa marca',
    steps: [
      'Abra Mais › Marca e galeria.',
      'Escolha o logótipo e a capa, e escreva um pequeno texto sobre o salão.',
      'Junte fotos de cortes à galeria. Toque em "Pôr primeiro" na melhor.',
      'Toque em "Ver a página" para ver como ficou.',
    ],
    tip: 'Peça sempre autorização ao cliente antes de publicar a foto dele.',
  },
  {
    id: 'estilo', group: 'Gestão do salão', title: 'Mudar as cores da página e do painel', screen: '/definicoes', need: 'definicoes', words: 'estilo tema cores aspeto',
    steps: [
      'Abra Mais › Definições e desça até "Estilo da página".',
      'Toque num estilo: fica guardado logo.',
      'Toque em "Ver a página de marcação" para ver como ficou.',
    ],
  },
  {
    id: 'domicilio', group: 'Gestão do salão', title: 'Aceitar marcações ao domicílio', screen: '/domicilio', need: 'domicilio', words: 'domicílio casa deslocação zona',
    steps: [
      'Abra Mais › Ao domicílio e ligue "Aceitar marcações ao domicílio".',
      'Crie as zonas: códigos postais, preço da deslocação e minutos de viagem.',
      'Escolha os serviços que faz em casa e quem faz as visitas. Se quiser, junte taxas extra.',
      'Na agenda, cada visita tem "A caminho" (avisa o cliente) e "Terminei".',
    ],
  },

  // Conta e assinatura
  {
    id: 'assinatura', group: 'Conta e assinatura', title: 'Pagar a assinatura', screen: '/assinatura', need: 'assinatura', words: 'pagar assinatura fatura mensalidade grátis',
    steps: [
      'Os primeiros 30 dias são grátis. Avisamos antes de terminarem.',
      'Depois, em Mais › Assinatura, aparece o pedido de pagamento com os dados para pagar por MB Way ou transferência.',
      'Depois de pagar, a fatura aparece aqui para descarregar.',
      'Se o pagamento ficar em falta, a conta passa a só de leitura: a agenda continua a ver-se, mas as marcações online param até pagar.',
    ],
    tip: 'Sem fidelização: pode cancelar quando quiser.',
  },
  {
    id: 'exportar', group: 'Conta e assinatura', title: 'Descarregar os seus dados', screen: '/definicoes', need: 'exportar', words: 'exportar csv excel cópia dados',
    steps: [
      'Abra Mais › Definições e desça até "Os seus dados".',
      'Toque em "Exportar clientes" ou "Exportar marcações": descarrega um ficheiro CSV, que abre no Excel.',
      'Guarde o ficheiro num sítio seguro: tem dados de clientes.',
    ],
  },
]

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Topics this person can use, optionally only those about one screen. */
export function topicsFor(role: Role, screen?: string): HelpTopic[] {
  return HELP.filter(t => can(role, t.need) && (!screen || t.screen === screen))
}

/** Search titles, steps and extra words, ignoring accents. Every word must match. */
export function searchHelp(topics: HelpTopic[], q: string): HelpTopic[] {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return topics
  return topics.filter(t => {
    const hay = fold([t.title, t.words ?? '', ...t.steps, t.tip ?? ''].join(' '))
    return words.every(w => hay.includes(w))
  })
}

/** The topic as a WhatsApp message, for sending to someone on the team. */
export function helpMessage(t: HelpTopic): string {
  return [`*${t.title}*`, ...t.steps.map((s, i) => `${i + 1}. ${s}`), ...(t.tip ? [`Dica: ${t.tip}`] : [])].join('\n')
}
