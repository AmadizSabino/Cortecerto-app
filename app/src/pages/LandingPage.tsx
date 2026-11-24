import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { euros, supabase } from '../lib/supabase'
import { COMPANY_DETAILS, LEGAL_DOCS } from '../lib/legal'
import { EXAMPLE_SLUG, PLAN } from '../lib/plan'
import { noShowCost, parseNumber } from '../lib/landing'
import { track } from '../lib/track'
import { FOUNDER, FOUNDERS, TESTIMONIALS } from '../lib/landingContent'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { MockAssistant, MockBooking, MockChat, MockClient, MockReminders, MockSocial, MockToday } from './landing/Mockups'
import './landing/landing.css'

const TYPES: [string, string][] = [['scissors', 'Barbearias'], ['spark', 'Cabeleireiros'], ['star', 'Unhas'], ['crown', 'Estética e depilação']]

const TRUST: string[] = ['Sem cartão', 'Sem fidelização', 'Pronto em 15 minutos', 'Dados guardados na UE']

const STEPS: [string, string, string][] = [
  ['settings', 'Crie o salão em 15 minutos', 'Serviços, preços, horários e a equipa. Se preferir, fazemos isso consigo.'],
  ['qr', 'Partilhe o seu link', 'Na bio do Instagram, no Google e no poster com QR que imprime para o balcão.'],
  ['calendar', 'Os clientes marcam sozinhos', 'A qualquer hora, sem ligar. Tudo aparece no ecrã Hoje, no seu telemóvel.'],
]

type Tour = { kicker: string; title: string; text: string; points: string[]; mock: React.ReactNode }
const TOUR: Tour[] = [
  {
    kicker: 'Para os seus clientes', title: 'Uma página de marcação com o nome e as cores do salão',
    text: 'O cliente escolhe o serviço, o profissional e a hora livre. Não instala nada e não precisa de conta.',
    points: ['Marcações às 23h, com o salão fechado e o telefone calado', 'Preços e duração de cada serviço à vista', 'Sinal por MB Way, direto para o salão, quando quiser pedir'],
    mock: <MockBooking />,
  },
  {
    kicker: 'O seu dia', title: 'O dia inteiro num ecrã, no bolso',
    text: 'Abra o ecrã Hoje entre dois cortes: quem vem, a que horas, o que vai fazer e quanto vai faturar.',
    points: ['Confirmar, concluir e registar faltas com um toque', 'Marcações de telefone ou ao balcão em segundos', 'Horário, pausas e folgas de cada profissional'],
    mock: <MockToday />,
  },
  {
    kicker: 'Menos faltas', title: 'Os lembretes de amanhã em dois minutos',
    text: 'Toque em cada cliente e o seu WhatsApp abre com a mensagem já escrita. É só carregar em enviar. Sai do seu número, por isso o cliente sabe quem é e responde.',
    points: ['Sem custo por mensagem: usa o WhatsApp do salão', 'O cliente muda a hora sozinho pelo link da mensagem', 'A vaga que fica livre pode ser oferecida a outro cliente'],
    mock: <MockReminders />,
  },
  {
    kicker: 'Clientes que voltam', title: 'Lembra-se de cada cliente, mesmo dos que vêm uma vez por mês',
    text: 'Cada marcação fica na ficha do cliente. Antes de pegar na máquina, já sabe o que ele gosta.',
    points: ['Histórico de visitas e notas de cada corte', 'Aniversários da semana e quem não vem há mais de 45 dias', 'Próxima visita sugerida ao fechar o corte'],
    mock: <MockClient />,
  },
]

const DAY = [
  { time: '09:00', title: 'Os lembretes de amanhã saem em dois minutos', text: 'Abre "Lembretes", toca em cada cliente e o WhatsApp abre com a mensagem pronta.' },
  { time: '11:40', title: 'Quem não pode vir, muda a hora sozinho', text: 'O link do lembrete deixa o cliente escolher outro horário livre. A vaga fica disponível para outro.' },
  { time: '15:15', title: 'Entra alguém sem marcação', text: 'Lê o QR à porta, entra na fila e vê quantas pessoas tem à frente. Chama-o por WhatsApp quando for a vez.' },
  { time: '19:30', title: 'A próxima visita fica marcada antes de sair', text: 'Ao fechar um corte, a app sugere o mesmo serviço daqui a três semanas, à hora do costume.' },
]

const FEATURES: [string, string, string][] = [
  ['calendar', 'Página de marcação', 'Com o seu nome, cores e logótipo. Um link para a bio e o Google.'],
  ['bell', 'Lembretes por WhatsApp', 'Um toque por cliente, a partir do WhatsApp do salão.'],
  ['queue', 'Fila de espera', 'Quem entra sem marcação lê o QR e vê a sua vez.'],
  ['users', 'Ficha de cada cliente', 'Visitas, notas, aniversários e quem deixou de vir.'],
  ['euro', 'Sinal por MB Way', 'O dinheiro vai direto para o salão. Nunca passa por nós.'],
  ['week', 'Equipa e horários', 'Agenda de cada profissional, folgas, férias e preços próprios.'],
  ['chart', 'Números do mês', 'Faturado, valor médio, faltas e clientes novos.'],
  ['print', 'Poster com QR', 'Pronto a imprimir para o balcão e a montra.'],
  ['crown', 'Clube de clientes', 'Mensalidade com benefícios: receita certa todos os meses.'],
  ['gift', 'Pacotes e packs', 'Combos, casamentos e eventos, packs de sessões.'],
  ['download', 'Os dados são seus', 'Exporte clientes e marcações para Excel quando quiser.'],
  ['shield', 'Seguro e legal', 'RGPD, servidores na União Europeia e acesso por conta.'],
]

/** "Um só sítio": what the salon stops juggling. Every line exists in the app today. */
const SWAP: [string, string][] = [
  ['Agenda de papel', 'Agenda e página de marcação'],
  ['Mensagens escritas à mão', 'Lembretes prontos, um toque cada'],
  ['Canva e falta de ideias', 'Posts e legendas feitos com IA'],
  ['Cartões de carimbos', 'Clube, packs e promoções com link'],
  ['Fila à porta', 'Fila de espera no telemóvel'],
  ['Folhas de Excel', 'Estatísticas e comissões da equipa'],
]

/** Tools the salon already uses, and how CorteCerto works with each. Only what is built. */
const WORKS: [string, string, string][] = [
  ['whatsapp', 'WhatsApp', 'Lembretes, confirmações e propostas saem do WhatsApp do salão, com a mensagem já escrita.'],
  ['image', 'Instagram e Facebook', 'Link de marcação na bio e posts prontos a publicar num toque, também no Estado do WhatsApp.'],
  ['euro', 'MB Way', 'Sinais, packs e mensalidades do Clube pagos diretamente para o MB Way do salão.'],
  ['star', 'Google', 'Link de marcação no perfil do Google e respostas às avaliações escritas pela IA.'],
  ['download', 'Contabilidade', 'Marcações com valores exportadas para Excel. A fatura ao cliente continua no seu programa certificado.'],
]

const AI_MORE: [string, string, string][] = [
  ['camera', 'Experimente antes de marcar', 'Na sua página, o cliente tira uma selfie e vê o estilo antes de escolher.'],
  ['scissors', 'Sugestões de corte', 'Ideias do seu catálogo para o cliente, com base no que procura.'],
  ['image', 'Notas a partir de uma foto', 'O cliente mostra a referência e a IA escreve as notas técnicas.'],
  ['star', 'Respostas a avaliações', 'Cole uma avaliação do Google e receba a resposta no tom do salão.'],
  ['chart', 'Relatório semanal', 'Três números, o que correu bem e uma ação para a semana.'],
  ['tag', 'Sugestões de preço', 'Intervalos indicativos para os seus serviços. O preço é sempre seu.'],
]

const FAQ: [string, string][] = [
  ['Os lembretes são enviados automaticamente?', 'Não, e é de propósito. A CorteCerto prepara a lista de amanhã e escreve cada mensagem. Toca em cada cliente, o WhatsApp do salão abre com o texto pronto e carrega em enviar. Para um dia normal são cerca de dois minutos, e o cliente recebe a mensagem do número que já conhece.'],
  ['As mensagens de WhatsApp têm custo?', 'Não. As mensagens saem do WhatsApp do próprio salão, como se as escrevesse à mão. A CorteCerto não cobra nada por mensagem.'],
  ['Os meus clientes precisam de instalar alguma coisa?', 'Não. Marcam numa página web, a partir do link ou do QR, sem criar conta. Só o salão pode, se quiser, instalar a CorteCerto no telemóvel como uma app.'],
  ['Preciso de computador?', 'Não. Tudo funciona no telemóvel, no tablet ou no computador do salão, ao mesmo tempo.'],
  ['Onde ficam os dados dos clientes?', 'Na União Europeia: a base de dados fica num centro de dados em Frankfurt, na Alemanha. Os dados são do salão. Pode exportá-los para Excel ou apagar os de um cliente que o peça, a qualquer momento. Cumprimos o RGPD e assinamos consigo o acordo de tratamento de dados.'],
  ['Quanto custa depois dos 30 dias?', `${euros(PLAN.priceCents)} + IVA por mês, com tudo incluído: sem limites de marcações, clientes ou profissionais. Recebe a fatura todos os meses no painel e paga por MB Way ou transferência.`],
  ['Tenho de dar o cartão para experimentar?', 'Não. Cria o salão só com o email. Ao fim dos 30 dias decide se continua.'],
  ['E se eu quiser cancelar?', 'Cancela quando quiser, sem fidelização e sem multas. Antes disso descarrega os seus clientes e marcações em Excel. Ficam seus.'],
  ['Já tenho clientes num caderno ou noutro programa.', 'Não precisa de passar tudo de uma vez. Cada cliente que marca online entra sozinho na lista, e os de telefone ou balcão adiciona em segundos. Ao fim de umas semanas tem os clientes habituais todos na app.'],
  ['A CorteCerto passa faturas aos meus clientes?', 'Não. Continue a usar o seu programa de faturação certificado. A CorteCerto trata das marcações, dos clientes, da agenda e da promoção do salão, e exporta as marcações com valores para Excel.'],
  ['A IA publica nas minhas redes sozinha?', 'Não. A IA dá as ideias, escreve a legenda e a app faz a imagem com o seu logótipo e as suas fotos. Você revê e publica com um toque no Instagram, no Facebook ou no Estado do WhatsApp.'],
  ['A IA vê os dados dos meus clientes?', 'Só o necessário para responder a uma pergunta sua. Os telemóveis e emails nunca são enviados, os nomes são trocados por códigos antes de saírem da CorteCerto e as fotos não são guardadas. Os fornecedores de IA não usam estes dados para treinar modelos.'],
  ['A IA tem custo extra?', 'Não. As ferramentas de IA estão incluídas no preço, com um limite mensal por ferramenta que chega para o dia a dia de um salão.'],
  ['E se tiver uma dúvida?', 'Cada ecrã tem um "?" com a explicação passo a passo. E pode falar connosco por email ou pedir uma demonstração.'],
]

const WITH_VAT = Math.round(PLAN.priceCents * (1 + PLAN.vatRate))

/** "Quanto lhe custam as faltas?": two numbers in, the month's loss out. */
function NoShowCalculator() {
  const [perWeek, setPerWeek] = useState('3')
  const [avg, setAvg] = useState('15')
  const r = noShowCost(parseNumber(perWeek), Math.round(parseNumber(avg) * 100), WITH_VAT)
  const valid = !isNaN(parseNumber(perWeek)) && !isNaN(parseNumber(avg))
  return (
    <div className="lp-calc">
      <div className="lp-calc-inputs">
        <label>Faltas por semana<input inputMode="decimal" value={perWeek} onChange={e => setPerWeek(e.target.value)} /></label>
        <label>Preço médio de um serviço (€)<input inputMode="decimal" value={avg} onChange={e => setAvg(e.target.value)} /></label>
        <p className="lp-small-print">Faça a conta com os números do seu salão. Fica só no seu ecrã, não guardamos nada.</p>
      </div>
      <div className="lp-calc-out" aria-live="polite">
        {valid ? <>
          <p>Por mês, as faltas custam-lhe cerca de</p>
          <p className="lp-calc-big">{euros(r.lostCents)}</p>
          <p className="lp-calc-year">ou {euros(r.lostCents * 12)} por ano.</p>
          <p>Se os lembretes e a troca de horário evitarem metade, recupera <strong>{euros(r.savedCents)}</strong> por mês{r.paysFor >= 1 ? `, ${r.paysFor >= 2 ? `${Math.floor(r.paysFor)} vezes` : 'mais do que'} o que custa a CorteCerto (${euros(WITH_VAT)} com IVA).` : '.'}</p>
          <Link to="/painel" className="lp-cta">Quero recuperar este dinheiro</Link>
        </> : <p>Escreva dois números, por exemplo 3 faltas e 15 €.</p>}
      </div>
    </div>
  )
}

/** "Prefere que lhe mostremos?": a demo request that lands in /admin > Contactos. */
function DemoRequest() {
  const [f, setF] = useState({ salon: '', name: '', phone: '', city: '', website: '' })
  const [state, setState] = useState<{ ok: boolean; text: string } | 'a_enviar'>()
  async function send(e: React.FormEvent) {
    e.preventDefault()
    setState('a_enviar')
    const res = await fetch('/api/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).catch(() => null)
    const out = await res?.json().catch(() => null) as { ok?: boolean; message?: string } | null
    setState(out?.ok ? { ok: true, text: 'Obrigado! Ligamos-lhe ou enviamos mensagem nas próximas 24 horas úteis para combinar.' }
      : { ok: false, text: out?.message ?? 'Não foi possível enviar. Tente daqui a pouco.' })
  }
  if (state && state !== 'a_enviar' && state.ok) return <p className="lp-demo-done">{state.text}</p>
  const field = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label>{label}<input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  return (
    <form className="lp-demo" onSubmit={send}>
      {field('salon', 'Nome do salão', { required: true, maxLength: 120, autoComplete: 'organization' })}
      {field('name', 'O seu nome', { maxLength: 120, autoComplete: 'name' })}
      {field('phone', 'Telemóvel', { required: true, inputMode: 'tel', autoComplete: 'tel', placeholder: '912 345 678' })}
      {field('city', 'Localidade', { maxLength: 80, autoComplete: 'address-level2' })}
      <label className="lp-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} /></label>
      <button className="lp-cta" disabled={state === 'a_enviar'}>{state === 'a_enviar' ? 'A enviar…' : 'Pedir demonstração'}</button>
      {state && state !== 'a_enviar' && !state.ok && <p className="lp-demo-error">{state.text}</p>}
      <p className="lp-small-print">Usamos estes dados só para combinar a demonstração.</p>
    </form>
  )
}

const Check = () => <span className="lp-tick"><Icon name="check" size={14} /></span>

/** Public home page: what CorteCerto does for a salon, the price, and how to start. */
export default function LandingPage() {
  const price = euros(PLAN.priceCents).replace(/,00(?=\s?€)/, '')
  const perDay = euros(Math.round(WITH_VAT / 30))
  // A salon that is signed in goes straight to its panel.
  const [signedIn, setSignedIn] = useState(false)
  // Phones: the bottom "Experimentar" bar shows once the hero's own button has scrolled away.
  const [pastHero, setPastHero] = useState(false)
  useEffect(() => {
    const el = document.getElementById('lp-hero-cta')
    if (!el || !('IntersectionObserver' in window)) { setPastHero(true); return }
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [signedIn])
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSignedIn(Boolean(data.session)); if (!data.session) track('visita', { page: 'site', key: 'site' }) }) }, [])
  if (signedIn) return <Navigate to="/painel" replace />
  const trial = `Experimentar ${PLAN.trialDays} dias grátis`
  return (
    <div className="lp">
      <header className="lp-nav-wrap">
        <div className="lp-nav">
          <Link to="/" className="lp-brand"><img src="/icon.svg" alt="" width={30} height={30} />CorteCerto</Link>
          <nav className="lp-nav-links" aria-label="Secções">
            <a href="#como-funciona">Como funciona</a>
            <a href="#preco">Preço</a>
            <a href="#perguntas">Perguntas</a>
          </nav>
          <div className="lp-nav-actions">
            <Link to="/painel" className="lp-login">Entrar</Link>
            <Link to="/painel" className="lp-cta sm lp-nav-cta">Começar grátis</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <p className="lp-pill"><span className="lp-flag" aria-hidden="true" />Feito em Portugal · Com inteligência artificial</p>
          <h1>Menos faltas. <span>Mais cadeiras ocupadas.</span></h1>
          <p className="lp-lead">A app completa para o seu salão: os clientes marcam online a qualquer hora, recebem o lembrete no WhatsApp e mudam a hora sozinhos, e a IA ajuda-o a encher as horas calmas. Você corta, a CorteCerto trata do resto.</p>
          <div className="lp-cta-row">
            <Link to="/painel" className="lp-cta lg" id="lp-hero-cta">{trial}</Link>
            <a href={`/s/${EXAMPLE_SLUG}?src=site-exemplo`} target="_blank" rel="noreferrer" className="lp-ghost">Ver um salão a funcionar ›</a>
          </div>
          <ul className="lp-trust">{TRUST.map(t => <li key={t}><Check />{t}</li>)}</ul>
        </div>
        <div className="lp-hero-art">
          <div className="lp-blob" aria-hidden="true" />
          <MockBooking />
          <MockChat />
          <p className="lp-float f1" aria-hidden="true"><span className="lp-dot" />Nova marcação · 23:47<small>Corte + barba, amanhã 10:00</small></p>
          <p className="lp-float f2" aria-hidden="true"><WhatsAppIcon size={16} />Lembrete enviado<small>do WhatsApp do salão</small></p>
        </div>
      </section>

      <section className="lp-types" aria-label="Para quem é">
        <p>Feito para</p>
        <ul>{TYPES.map(([i, t]) => <li key={t}><Icon name={i} size={18} />{t}</li>)}</ul>
      </section>

      <section className="lp-section lp-problem">
        <div className="lp-head">
          <p className="lp-kicker">A conta que ninguém faz</p>
          <h2>Quanto lhe custam as faltas?</h2>
          <p className="lp-sub">Uma cadeira vazia não se recupera. Ponha os seus números e veja o que perde por mês.</p>
        </div>
        <NoShowCalculator />
      </section>

      <section className="lp-section" id="como-funciona">
        <div className="lp-head center">
          <p className="lp-kicker">Como funciona</p>
          <h2>Pronto hoje, sem complicações</h2>
        </div>
        <ol className="lp-steps">
          {STEPS.map(([i, t, d], n) => (
            <li key={t}><span className="lp-step-ico"><Icon name={i} size={22} /><b>{n + 1}</b></span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      {TOUR.map((t, i) => (
        <section key={t.title} className={`lp-section lp-tour ${i % 2 ? 'flip' : ''}`}>
          <div className="lp-tour-copy">
            <p className="lp-kicker">{t.kicker}</p>
            <h2>{t.title}</h2>
            <p className="lp-sub">{t.text}</p>
            <ul className="lp-points">{t.points.map(p => <li key={p}><Check />{p}</li>)}</ul>
          </div>
          <div className="lp-tour-art"><div className="lp-blob" aria-hidden="true" />{t.mock}</div>
        </section>
      ))}

      <section className="lp-section lp-ai" id="ia">
        <div className="lp-head">
          <p className="lp-kicker"><Icon name="spark" size={16} />Inteligência artificial incluída</p>
          <h2>Um assistente que conhece o seu salão</h2>
          <p className="lp-sub">Dez ferramentas de IA, em português, feitas para o dia a dia de um salão. Incluídas no preço, sem pagar à parte.</p>
        </div>
        <div className="lp-ai-grid">
          <article className="lp-ai-card">
            <div>
              <span className="lp-ai-tag">Social Media Manager</span>
              <h3>Os posts da semana, feitos consigo</h3>
              <p>A IA vê as horas calmas da agenda e as datas que aí vêm, sugere a promoção certa e escreve a legenda. A app faz a imagem com o seu logótipo e as suas fotos.</p>
              <ul className="lp-points"><li><Check />Três ideias de posts por semana</li><li><Check />Cada promoção tem link próprio e conta as marcações que trouxe</li><li><Check />Você revê e publica num toque</li></ul>
            </div>
            <MockSocial />
          </article>
          <article className="lp-ai-card">
            <div>
              <span className="lp-ai-tag">Assistente do salão</span>
              <h3>Pergunte como perguntaria a um gerente</h3>
              <p>"Tenho buracos amanhã?", "Quem não vem há dois meses?", "Como correu a semana?". A resposta vem da sua agenda real, em segundos.</p>
              <ul className="lp-points"><li><Check />Horas livres por profissional</li><li><Check />Clientes que deixaram de vir</li><li><Check />Os valores em euros só aparecem ao dono</li></ul>
            </div>
            <MockAssistant />
          </article>
        </div>
        <article className="lp-ai-card lp-ai-wide">
          <div>
            <span className="lp-ai-tag">Antes e depois</span>
            <h3>Mostre o resultado antes de pegar na tesoura</h3>
            <p>Tire uma foto ao cliente na cadeira, escolha o estilo e em cerca de 10 segundos vê o novo visual ao lado da foto original. Fades, barba, cor ou unhas. Menos dúvidas, clientes mais seguros, e serviços extra que se vendem sozinhos.</p>
          </div>
        </article>
        <ul className="lp-ai-more">
          {AI_MORE.map(([i, t, d]) => <li key={t}><span className="lp-ico"><Icon name={i} size={20} /></span><h3>{t}</h3><p>{d}</p></li>)}
        </ul>
        <p className="lp-ai-privacy"><Icon name="shield" size={18} />Os telemóveis e emails dos clientes nunca vão para a IA, os nomes são trocados por códigos e as fotos não são guardadas. Os dados não são usados para treinar modelos.</p>
      </section>

      <section className="lp-section lp-dark">
        <div className="lp-head">
          <p className="lp-kicker">Um dia no salão</p>
          <h2>O que muda, hora a hora</h2>
        </div>
        <ol className="lp-day">
          {DAY.map(d => (
            <li key={d.time}><time>{d.time}</time><div><h3>{d.title}</h3><p>{d.text}</p></div></li>
          ))}
        </ol>
      </section>

      <section className="lp-section">
        <div className="lp-head center">
          <p className="lp-kicker">Tudo incluído</p>
          <h2>Tudo o que o salão usa, num só sítio</h2>
        </div>
        <ul className="lp-features">
          {FEATURES.map(([i, t, d]) => <li key={t}><span className="lp-ico"><Icon name={i} size={22} /></span><h3>{t}</h3><p>{d}</p></li>)}
        </ul>
      </section>

      <section className="lp-section" id="tudo">
        <div className="lp-head center">
          <p className="lp-kicker">Uma só app</p>
          <h2>Tudo o que o salão precisa, de ponta a ponta</h2>
          <p className="lp-sub">Da marcação ao post no Instagram, do lembrete às contas do mês. Uma app, um login, um preço.</p>
        </div>
        <div className="lp-all">
          <div className="lp-swap">
            <h3>Deixa de precisar de</h3>
            <ul>{SWAP.map(([a, b]) => <li key={a}><span className="from">{a}</span><span className="arrow" aria-hidden="true">→</span><span className="to">{b}</span></li>)}</ul>
          </div>
          <div>
            <h3 className="lp-works-title">E funciona com o que já usa</h3>
            <ul className="lp-works">
              {WORKS.map(([i, t, d]) => <li key={t}><span className={`lp-ico ${i === 'whatsapp' ? 'wa-ico' : ''}`}>{i === 'whatsapp' ? <WhatsAppIcon size={20} /> : <Icon name={i} size={20} />}</span><span><b>{t}</b><span>{d}</span></span></li>)}
            </ul>
          </div>
        </div>
      </section>

      {TESTIMONIALS.length > 0 && (
        <section className="lp-section">
          <div className="lp-head center"><p className="lp-kicker">Quem já usa</p><h2>O que dizem os salões</h2></div>
          <ul className="lp-quotes">
            {TESTIMONIALS.map(q => (
              <li key={q.name + q.salon}>
                <p className="lp-stars" aria-label="5 estrelas">★★★★★</p>
                <blockquote>“{q.quote}”</blockquote>
                <p className="lp-quote-by">{q.photo ? <img src={q.photo} alt="" width={40} height={40} /> : <span className="lp-av">{q.name.slice(0, 1)}</span>}<span><b>{q.name}</b><small>{q.salon}, {q.city}</small></span></p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lp-section lp-founders" id="fundadores">
        <div className="lp-founders-card">
          <p className="lp-badge"><Icon name="crown" size={16} />Salões fundadores</p>
          <h2>Seja um dos primeiros {FOUNDERS.spots} salões</h2>
          <p className="lp-sub">Estamos a começar e queremos fazer isto bem, salão a salão. Quem entra agora tem condições que não vão voltar.</p>
          <ul className="lp-perks">
            {FOUNDERS.perks.map(p => <li key={p.title}><span className="lp-ico"><Icon name={p.icon} size={20} /></span><span><b>{p.title}</b><small>{p.text}</small></span></li>)}
          </ul>
          <Link to="/painel" className="lp-cta lg">Quero ser fundador</Link>
        </div>
        <figure className="lp-promise">
          <blockquote>“{FOUNDER.quote}”</blockquote>
          <ul>{FOUNDER.promises.map(p => <li key={p}><Check />{p}</li>)}</ul>
          <figcaption><span className="lp-av lg">{FOUNDER.initials}</span><span><b>{FOUNDER.name}</b><small>{FOUNDER.role}</small></span></figcaption>
        </figure>
      </section>

      <section className="lp-section lp-price" id="preco">
        <div className="lp-head center">
          <p className="lp-kicker">Preço</p>
          <h2>Um preço, tudo incluído</h2>
          <p className="lp-sub">Cerca de {perDay} por dia, com IVA. Duas faltas evitadas por mês já pagam a CorteCerto.</p>
        </div>
        <div className="lp-price-box">
          <p className="lp-plan">CorteCerto</p>
          <p className="lp-amount"><strong>{price}</strong><span>+ IVA<br />por mês</span></p>
          <p className="lp-small">{PLAN.trialDays} dias grátis, sem cartão. Fatura todos os meses no painel.</p>
          <ul className="lp-points">
            {['Marcações, clientes e profissionais sem limite', 'Página de marcação e poster com QR', 'Lembretes por WhatsApp sem custo por mensagem', 'Fila de espera, sinais por MB Way e estatísticas', '10 ferramentas de IA incluídas', 'Ajuda em português, por pessoas'].map(p => <li key={p}><Check />{p}</li>)}
          </ul>
          <Link to="/painel" className="lp-cta lg block">Criar o meu salão grátis</Link>
          <p className="lp-guarantee"><Icon name="shield" size={16} />Sem fidelização. Cancela quando quiser e leva os seus dados.</p>
        </div>
      </section>

      <section className="lp-section lp-demo-section" id="demonstracao">
        <div>
          <p className="lp-kicker">Sem tempo para isto?</p>
          <h2>Prefere que lhe mostremos?</h2>
          <p className="lp-sub">Passamos pelo salão ou fazemos uma videochamada de 15 minutos, e deixamos tudo configurado consigo: serviços, horários e a página de marcação. Sem compromisso.</p>
          <ul className="lp-points"><li><Check />Respondemos em 24 horas úteis</li><li><Check />Em português, à sua hora</li></ul>
        </div>
        <DemoRequest />
      </section>

      <section className="lp-section" id="perguntas">
        <div className="lp-head center"><p className="lp-kicker">Perguntas frequentes</p><h2>Tudo o que costumam perguntar</h2></div>
        <div className="lp-faq">
          {FAQ.map(([q, a], i) => <details key={q} open={i < 2}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="lp-final">
        <h2>A próxima cadeira vazia pode ser a última.</h2>
        <p>Crie o seu salão em 15 minutos e partilhe o link ainda hoje.</p>
        <div className="lp-cta-row center">
          <Link to="/painel" className="lp-cta lg light">{trial}</Link>
          <a href="#demonstracao" className="lp-ghost light">Pedir demonstração</a>
        </div>
        <p className="lp-final-note">Sem cartão · Sem fidelização · {price} + IVA por mês depois</p>
      </section>

      <div className={`lp-sticky ${pastHero ? 'on' : ''}`}><Link to="/painel" className="lp-cta block">{trial}</Link></div>

      <footer className="lp-foot">
        <div>
          <span className="lp-brand"><img src="/icon.svg" alt="" width={24} height={24} />CorteCerto</span>
          <small>{COMPANY_DETAILS.name} · NIPC {COMPANY_DETAILS.nipc} · {COMPANY_DETAILS.city}, Portugal</small>
        </div>
        <nav>{LEGAL_DOCS.map(d => <Link key={d.id} to={d.path}>{d.title}</Link>)}</nav>
      </footer>
    </div>
  )
}
