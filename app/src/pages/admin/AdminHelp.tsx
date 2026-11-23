/** /admin: a short "how to use this tab" under the tabs, closed until opened. */

export type AdminTab = 'resumo' | 'dinheiro' | 'site' | 'contactos' | 'saloes' | 'sistema'

const ADMIN_HELP: Record<AdminTab, string[]> = {
  resumo: [
    'Comece o dia por "Precisa de atenção": salões com o período grátis a acabar, pagamentos em atraso e registos a meio. Toque num para o abrir.',
    '"Do registo ao pagamento" mostra quantos salões passam de conta criada a salão a pagar.',
    'Os gráficos semanais mostram se a CorteCerto está a crescer: novos salões e marcações.',
    'Os salões de demonstração não contam para estes números.',
  ],
  dinheiro: [
    'Início do mês: em "Pedidos de pagamento", toque em Ver PDF para confirmar e depois em Enviar (ou "Enviar todos"). O salão recebe o email e vê o pedido em Assinatura.',
    'Quando o dinheiro chegar (MB Way ou transferência), toque em "Marcar como paga" na fatura: escolha a data e a forma. Deixe ligado "Passar a Ativa e o Pago até" para o salão ficar em dia.',
    'Depois de passar a fatura no seu programa de faturação, carregue o PDF no salão (separador Salões › abrir o salão).',
    '"Lembretes de pagamento" lista quem está em atraso, com o botão para enviar o lembrete.',
    'Em "Pedidos e faturas enviados" vê tudo o que foi enviado. O filtro "Pagos sem fatura" mostra o que ainda falta faturar.',
    'Em "Como os salões pagam" ficam o seu MB Way e o IBAN, que aparecem nos pedidos de pagamento.',
  ],
  site: [
    'Quantas pessoas visitam o site e as páginas dos salões, de onde vêm, e quantas criam conta ou marcam.',
    'Junte ?src= aos links que partilha (por exemplo /?src=instagram) para os ver separados em "De onde vêm".',
    '"Como os salões conheceram a CorteCerto" vem da pergunta no fim do registo.',
    'Um salão com muitas visitas e poucas marcações costuma ter poucos horários livres ou preços em falta: vale um telefonema.',
  ],
  contactos: [
    'A sua lista de salões a contactar. Os pedidos de demonstração do site entram aqui sozinhos, como "Por contactar", e recebe um email.',
    '"Para falar hoje" mostra quem tem o próximo contacto marcado para hoje ou já passou.',
    'Depois de cada conversa, abra o contacto, mude o estado, escreva uma nota e marque o próximo contacto.',
    'Quando o salão criar conta, escolha essa conta no contacto para seguir o resultado.',
  ],
  saloes: [
    'Procure um salão pelo nome e toque para o abrir.',
    'Para desbloquear um salão que pagou: Estado "Ativa", "Pago até" numa data futura e "Guardar assinatura". (Marcar a fatura como paga em Dinheiro faz isto por si.)',
    'Para dar a fatura ao salão: escolha o PDF e carregue-o. O salão vê-o e descarrega-o em Assinatura.',
    'Em cada salão pode guardar os dados de faturação (NIF, email), escrever notas internas e ver o registo de alterações.',
    'Salão de demonstração: marque "É um salão de demonstração" e toque em "Encher com dados de exemplo" antes de uma demo. Não conta para os números.',
  ],
  sistema: [
    'Ative o código de 2 passos: o admin vê os dados e o dinheiro de todos os salões.',
    '"O site está no ar?" verifica o site a cada 5 minutos e envia-lhe um email se ele cair.',
    'Veja o custo da IA do mês e ajuste o orçamento. Recebe um aviso quando se aproximar do limite.',
    'Em "Emails para si" escolha o email dos avisos e se quer o resumo diário.',
    'O registo de alterações mostra tudo o que foi mudado no admin, e quando.',
  ],
}

export function AdminHelp({ tab }: { tab: AdminTab }) {
  return (
    <details className="help-note card soft small" key={tab}>
      <summary>Como usar este separador</summary>
      <ul>{ADMIN_HELP[tab].map((l, i) => <li key={i}>{l}</li>)}</ul>
    </details>
  )
}
