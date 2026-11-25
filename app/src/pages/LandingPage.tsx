import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { euros, supabase } from '../lib/supabase'
import { COMPANY_DETAILS, LEGAL_DOCS } from '../lib/legal'
import { EXAMPLE_SLUG, PLAN } from '../lib/plan'
import { GRACE_DAYS } from '../lib/billing'
import { noShowCost, parseNumber } from '../lib/landing'
import { track } from '../lib/track'
import { FOUNDER, FOUNDERS, TESTIMONIALS } from '../lib/landingContent'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { MockAssistant, MockChat, Shot } from './landing/Mockups'
import ReminderDemo from './landing/ReminderDemo'
import './landing/landing.css'

/** Who the app is for. Photos are AI-generated atmosphere (no faces); swap by replacing public/landing/tipo-*.webp. */
const TYPES: [string, string, string][] = [['scissors', 'Barbearias', 'barbearia'], ['spark', 'Cabeleireiros', 'cabeleireiro'], ['star', 'Unhas', 'unhas'], ['crown', 'Estética e depilação', 'estetica']]

/** Before/after examples in the AI section: [file key, style as picked in the app]. Fictional people; the "after" is real app output (scripts in PR). */
const BEFORE_AFTER: [string, string][] = [['barba', 'Barba curta desenhada'], ['fade', 'Mid fade'], ['bob', 'Long bob']]

/** Every "start" button: the panel's login screen, opened on "Criar conta". */
const SIGNUP = '/painel?conta=nova'

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
    mock: <Shot src="marcacao-2" label="Página de marcação real de um salão, com os serviços e preços" />,
  },
  {
    kicker: 'O seu dia', title: 'O dia inteiro num ecrã, no bolso',
    text: 'Abra o ecrã Hoje entre dois cortes: quem vem, a que horas, o que vai fazer e quanto vai faturar.',
    points: ['Confirmar, concluir e registar faltas com um toque', 'Marcações de telefone ou ao balcão em segundos', 'Horário, pausas e folgas de cada profissional'],
    mock: <Shot src="hoje" label="Ecrã Hoje da app: marcações do dia, lembretes e assistente" />,
  },
  {
    kicker: 'Menos faltas', title: 'Os lembretes de amanhã em dois minutos',
    text: 'Toque em cada cliente e o seu WhatsApp abre com a mensagem já escrita. É só carregar em enviar. Sai do seu número, por isso o cliente sabe quem é e responde.',
    points: ['Sem custo por mensagem: usa o WhatsApp do salão', 'O cliente muda a hora sozinho pelo link da mensagem', 'A vaga que fica livre pode ser oferecida a outro cliente'],
    mock: <Shot src="lembretes" label="Ecrã Lembretes da app: um toque por cliente" />,
  },
  {
    kicker: 'Clientes que voltam', title: 'Lembra-se de cada cliente, mesmo dos que vêm uma vez por mês',
    text: 'Cada marcação fica na ficha do cliente. Antes de pegar na máquina, já sabe o que ele gosta.',
    points: ['Histórico de visitas e notas de cada corte', 'Aniversários da semana e quem não vem há mais de 45 dias', 'Próxima visita sugerida ao fechar o corte'],
    mock: <Shot src="cliente" label="Ficha de um cliente na app: visitas, notas e aniversário" />,
  },
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

/** Announced but not built yet (Francisco chose to show them as "Em breve", 2026-11-24). Remove the badge when they ship. */
const SOON: [string, string, string][] = [
  ['card', 'Ligação ao seu programa de faturação', 'A marcação concluída passa para o seu programa de faturação certificado. Será um extra opcional.'],
  ['phone', 'Assistente de WhatsApp', 'Responde aos clientes a qualquer hora e marca, muda ou cancela na agenda real.'],
]

const AI_MORE: [string, string, string][] = [
  ['camera', 'Experimente antes de marcar', 'Na sua página, o cliente tira uma selfie e vê o estilo antes de escolher.'],
  ['scissors', 'Sugestões de corte', 'Ideias do seu catálogo para o cliente, com base no que procura.'],
  ['image', 'Notas a partir de uma foto', 'O cliente mostra a referência e a IA escreve as notas técnicas.'],
  ['star', 'Respostas a avaliações', 'Cole uma avaliação do Google e receba a resposta no tom do salão.'],
  ['chart', 'Relatório semanal', 'Três números, o que correu bem e uma ação para a semana.'],
  ['tag', 'Sugestões de preço', 'Intervalos indicativos para os seus serviços. O preço é sempre seu.'],
]

/** The questions that decide a sign-up come first; the first FAQ_OPEN are open. */
const FAQ: [string, string][] = [
  ['As mensagens de WhatsApp têm custo?', 'Não. As mensagens saem do WhatsApp do próprio salão, como se as escrevesse à mão. A CorteCerto não cobra nada por mensagem.'],
  ['Tenho de dar o cartão para experimentar?', `Não. Cria o salão só com o email. Ao fim dos ${PLAN.trialDays} dias decide se continua: nada é cobrado sozinho.`],
  ['Os meus clientes precisam de instalar alguma coisa?', 'Não. Marcam numa página web, a partir do link ou do QR, sem criar conta. Só o salão pode, se quiser, instalar a CorteCerto no telemóvel como uma app.'],
  ['E se eu quiser cancelar?', 'Cancela quando quiser, sem fidelização e sem multas. Antes disso descarrega os seus clientes e marcações em Excel. Ficam seus.'],
  ['A CorteCerto passa faturas aos meus clientes?', 'Não. Continue a usar o seu programa de faturação certificado. Hoje a CorteCerto exporta as marcações com valores para Excel; em breve vai poder ligá-la ao seu programa de faturação, como extra opcional.'],
  ['Os lembretes são enviados automaticamente?', 'Não, e é de propósito. A CorteCerto prepara a lista de amanhã e escreve cada mensagem. Toca em cada cliente, o WhatsApp do salão abre com o texto pronto e carrega em enviar. Para um dia normal são cerca de dois minutos, e o cliente recebe a mensagem do número que já conhece.'],
  ['Quanto custa depois dos 30 dias?', `${euros(PLAN.priceCents)} + IVA por mês, com tudo incluído: sem limites de marcações, clientes ou profissionais. Recebe a fatura todos os meses no painel e paga por MB Way ou transferência.`],
  ['Preciso de computador?', 'Não. Tudo funciona no telemóvel, no tablet ou no computador do salão, ao mesmo tempo.'],
  ['Onde ficam os dados dos clientes?', 'Na União Europeia: a base de dados fica num centro de dados em Frankfurt, na Alemanha. Os dados são do salão. Pode exportá-los para Excel ou apagar os de um cliente que o peça, a qualquer momento. Cumprimos o RGPD e assinamos consigo o acordo de tratamento de dados.'],
  ['Já tenho clientes num caderno ou noutro programa.', 'Não precisa de passar tudo de uma vez. Cada cliente que marca online entra sozinho na lista, e os de telefone ou balcão adiciona em segundos. Ao fim de umas semanas tem os clientes habituais todos na app.'],
  ['A IA publica nas minhas redes sozinha?', 'Não. A IA dá as ideias, escreve a legenda e a app faz a imagem com o seu logótipo e as suas fotos. Revê e publica com um toque no Instagram, no Facebook ou no Estado do WhatsApp.'],
  ['A IA vê os dados dos meus clientes?', 'Só o necessário para responder a uma pergunta sua. Os telemóveis e emails nunca são enviados, os nomes são trocados por códigos antes de saírem da CorteCerto e as fotos não são guardadas. Os fornecedores de IA não usam estes dados para treinar modelos.'],
  ['A IA tem custo extra?', 'Não. As ferramentas de IA estão incluídas no preço, com um limite mensal por ferramenta que chega para o dia a dia de um salão.'],
  ['E se tiver uma dúvida?', 'Cada ecrã tem um "?" com a explicação passo a passo. E pode falar connosco por email ou pedir uma demonstração.'],
]
const FAQ_OPEN = 3

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
        <label className="lp-slider"><span className="lp-slider-top">Faltas por semana<output>{perWeek}</output></span>
          <input type="range" min={0} max={15} step={1} value={perWeek} onChange={e => setPerWeek(e.target.value)} /></label>
        <label className="lp-slider"><span className="lp-slider-top">Preço médio de um serviço<output>{avg} €</output></span>
          <input type="range" min={5} max={80} step={1} value={avg} onChange={e => setAvg(e.target.value)} /></label>
        <p className="lp-small-print">Arraste para os números do seu salão. Fica só no seu ecrã, não guardamos nada.</p>
      </div>
      <div className="lp-calc-out" aria-live="polite">
        {valid ? <>
          <p>Por mês, as faltas custam-lhe cerca de</p>
          <p className="lp-calc-big huge">{euros(r.lostCents)}</p>
          <p className="lp-calc-year">ou {euros(r.lostCents * 12)} por ano.</p>
          <p>Se os lembretes e a troca de horário evitarem metade, recupera <strong>{euros(r.savedCents)}</strong> por mês{r.paysFor >= 1 ? `, ${r.paysFor >= 2 ? `${Math.floor(r.paysFor)} vezes` : 'mais do que'} o que custa a CorteCerto (${euros(WITH_VAT)} com IVA).` : '.'}</p>
          <Link to={SIGNUP} className="lp-cta">Quero recuperar este dinheiro</Link>
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
      {field('name', 'O seu nome', { maxLength: 120, autoComplete: 'name' })}
      {field('phone', 'Telemóvel ou WhatsApp', { required: true, inputMode: 'tel', autoComplete: 'tel', placeholder: '912 345 678' })}
      {field('salon', 'Salão e localidade', { required: true, maxLength: 120, placeholder: 'Ex.: Barbearia Central, Setúbal' })}
      <label className="lp-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} /></label>
      <button className="lp-cta" disabled={state === 'a_enviar'}>{state === 'a_enviar' ? 'A enviar…' : 'Pedir demonstração'}</button>
      {state && state !== 'a_enviar' && !state.ok && <p className="lp-demo-error">{state.text}</p>}
      <p className="lp-small-print">Usamos estes dados só para combinar a demonstração.</p>
    </form>
  )
}

const Check = () => <span className="lp-tick"><Icon name="check" size={14} /></span>

/** The four app screens as tabs: one screen high instead of four. */
function TourTabs() {
  const [i, setI] = useState(0)
  const t = TOUR[i]
  return (
    <section className="lp-section lp-tour-tabs" id="app">
      <div className="lp-head center">
        <p className="lp-kicker">A app por dentro</p>
        <h2>Ecrãs reais, como os vai usar</h2>
      </div>
      <div className="lp-tabs" role="tablist" aria-label="Ecrãs da app">
        {TOUR.map((x, n) => <button key={x.kicker} type="button" role="tab" aria-selected={n === i} className={n === i ? 'sel' : ''} onClick={() => setI(n)}>{x.kicker}</button>)}
      </div>
      <div className="lp-tour" role="tabpanel">
        <div className="lp-tour-copy">
          <h3 className="lp-tour-title">{t.title}</h3>
          <p className="lp-sub">{t.text}</p>
          <ul className="lp-points">{t.points.map(p => <li key={p}><Check />{p}</li>)}</ul>
        </div>
        <div className="lp-tour-art"><div className="lp-blob" aria-hidden="true" />{t.mock}</div>
      </div>
    </section>
  )
}

/** The three AI tools salons ask about first, as tabs. */
function AiTabs() {
  const [i, setI] = useState(0)
  const tabs: [string, React.ReactNode][] = [
    ['Antes e depois', (
        <article className="lp-ai-card lp-ai-wide">
          <div>
            <span className="lp-ai-tag">Antes e depois</span>
            <h3>Mostre o resultado antes de pegar na tesoura</h3>
            <p>Tire uma foto ao cliente na cadeira, escolha o estilo e em cerca de 10 segundos vê o novo visual ao lado da foto original. Fades, barba, cor ou unhas. Menos dúvidas, clientes mais seguros, e serviços extra que se vendem sozinhos.</p>
          </div>
          <div className="lp-ba">
            <ul>{BEFORE_AFTER.map(([k, style]) => (
              <li key={k}>
                <figure><img src={`/landing/ia-${k}-antes.webp`} alt={`Antes: ${style}`} width={400} height={500} loading="lazy" decoding="async" /><figcaption>Antes</figcaption></figure>
                <figure><img src={`/landing/ia-${k}-depois.webp`} alt={`Depois: ${style}, imagem feita pela app`} width={400} height={500} loading="lazy" decoding="async" /><figcaption>Depois</figcaption></figure>
                <p>{style}</p>
              </li>
            ))}</ul>
            <p className="lp-ba-note">Pessoas fictícias, criadas por IA. Cada "depois" foi feito pela funcionalidade da app, a partir da foto "antes" e do estilo indicado.</p>
          </div>
        </article>
    )],
    ['Posts da semana', (
          <article className="lp-ai-card">
            <div>
              <span className="lp-ai-tag">Social Media Manager</span>
              <h3>Os posts da semana, feitos consigo</h3>
              <p>A IA vê as horas calmas da agenda e as datas que aí vêm, sugere a promoção certa e escreve a legenda. A app faz a imagem com o seu logótipo e as suas fotos.</p>
              <ul className="lp-points"><li><Check />Três ideias de posts por semana</li><li><Check />Cada promoção tem link próprio e conta as marcações que trouxe</li><li><Check />Revê e publica num toque</li></ul>
            </div>
            <figure className="lp-post">
              <div className="lp-post-head"><span className="mk-av sm">BB</span>barbaebeer</div>
              <img src="/landing/post.webp" alt="Imagem de promoção feita pela app para o Instagram" width={720} height={900} loading="lazy" />
              <figcaption><b>barbaebeer</b>Terça de manhã com calma e 20% em corte + barba. Marque pelo link na bio ✂️</figcaption>
            </figure>
          </article>
    )],
    ['Assistente', (
          <article className="lp-ai-card">
            <div>
              <span className="lp-ai-tag">Assistente do salão</span>
              <h3>Pergunte como perguntaria a um gerente</h3>
              <p>"Tenho buracos amanhã?", "Quem não vem há dois meses?", "Como correu a semana?". A resposta vem da sua agenda real, em segundos.</p>
              <ul className="lp-points"><li><Check />Horas livres por profissional</li><li><Check />Clientes que deixaram de vir</li><li><Check />Os valores em euros só aparecem ao dono</li></ul>
            </div>
            <MockAssistant />
          </article>
    )],
  ]
  return <>
    <div className="lp-tabs" role="tablist" aria-label="Ferramentas de IA">
      {tabs.map(([label], n) => <button key={label} type="button" role="tab" aria-selected={n === i} className={n === i ? 'sel' : ''} onClick={() => setI(n)}>{label}</button>)}
    </div>
    <div role="tabpanel">{tabs[i][1]}</div>
  </>
}

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
            <Link to={SIGNUP} className="lp-cta sm lp-nav-cta">Começar grátis</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        {/* Atmosphere photo (AI-generated, faces not shown); to swap, replace public/landing/hero-salao.webp */}
        <div className="lp-photo" aria-hidden="true" />
        <div className="lp-hero-copy">
          <p className="lp-pill"><span className="lp-flag" aria-hidden="true" />Feito em Portugal · {PLAN.trialDays} dias grátis</p>
          <h1>Menos faltas. <span>Mais cadeiras ocupadas.</span></h1>
          <p className="lp-lead">Os clientes marcam online a qualquer hora e recebem o lembrete no WhatsApp do salão. Se não puderem vir, mudam a hora sozinhos. Menos mensagens, menos faltas, mais tempo para cortar.</p>
          <div className="lp-cta-row">
            <Link to={SIGNUP} className="lp-cta lg" id="lp-hero-cta">{trial}</Link>
            <a href={`/s/${EXAMPLE_SLUG}?src=site-exemplo`} target="_blank" rel="noreferrer" className="lp-ghost">Ver uma página de marcação a funcionar ›</a>
          </div>
          <ul className="lp-trust">{TRUST.map(t => <li key={t}><Check />{t}</li>)}</ul>
        </div>
        <div className="lp-hero-art">
          <Shot src="marcacao" label="Página de marcação de um salão na CorteCerto" />
          <MockChat />
          <p className="lp-float f1" aria-hidden="true"><span className="lp-dot" />Nova marcação · 23:47<small>Corte + barba, amanhã 10:00</small></p>
          <p className="lp-float f2" aria-hidden="true"><WhatsAppIcon size={16} />Lembrete enviado<small>do WhatsApp do salão</small></p>
        </div>
      </section>

      <section className="lp-types" aria-label="Para quem é">
        <p>Software de marcações para</p>
        <ul>{TYPES.map(([i, t, img]) => (
          <li key={t}>
            <img src={`/landing/tipo-${img}.webp`} alt="" width={560} height={700} loading="lazy" decoding="async" />
            <span><Icon name={i} size={18} />{t}</span>
          </li>
        ))}</ul>
      </section>

      <section className="lp-section lp-demo-try" id="experimentar">
        <div className="lp-head">
          <p className="lp-kicker">Experimente aqui</p>
          <h2>O lembrete sai do WhatsApp do salão. Por isso o cliente responde.</h2>
          <p className="lp-sub">Escolha o tipo de salão, o serviço e a hora. É este o texto que a CorteCerto escreve para cada cliente, com o link para mudar de hora. O salão só toca em enviar.</p>
        </div>
        <ReminderDemo />
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

      <TourTabs />

      <section className="lp-section lp-ai" id="ia">
        <div className="lp-head">
          <p className="lp-kicker"><Icon name="spark" size={16} />Inteligência artificial incluída</p>
          <h2>Um assistente que conhece o seu salão</h2>
          <p className="lp-sub">Dez ferramentas de IA em português, incluídas no preço. Estas são as que os salões mais usam.</p>
        </div>
        <AiTabs />
        <details className="lp-more">
          <summary>Ver as outras {AI_MORE.length} ferramentas de IA</summary>
          <ul className="lp-ai-more">
            {AI_MORE.map(([i, t, d]) => <li key={t}><span className="lp-ico"><Icon name={i} size={20} /></span><h3>{t}</h3><p>{d}</p></li>)}
          </ul>
        </details>
        <p className="lp-ai-privacy"><Icon name="shield" size={18} />Os telemóveis e emails dos clientes nunca vão para a IA, os nomes são trocados por códigos e as fotos não são guardadas. Os dados não são usados para treinar modelos.</p>
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
            <ul className="lp-works-chips">
              {WORKS.map(([i, t]) => <li key={t}><span className={`lp-ico ${i === 'whatsapp' ? 'wa-ico' : ''}`}>{i === 'whatsapp' ? <WhatsAppIcon size={18} /> : <Icon name={i} size={18} />}</span>{t}</li>)}
            </ul>
          </div>
        </div>
        <details className="lp-more">
          <summary>Ver todas as funções e o que vem a seguir</summary>
          <ul className="lp-features">
            {FEATURES.map(([i, t, d]) => <li key={t}><span className="lp-ico"><Icon name={i} size={22} /></span><h3>{t}</h3><p>{d}</p></li>)}
          </ul>
          <ul className="lp-works">
            {WORKS.map(([i, t, d]) => <li key={t}><span className={`lp-ico ${i === 'whatsapp' ? 'wa-ico' : ''}`}>{i === 'whatsapp' ? <WhatsAppIcon size={20} /> : <Icon name={i} size={20} />}</span><span><b>{t}</b><span>{d}</span></span></li>)}
            {SOON.map(([i, t, d]) => <li key={t} className="soon"><span className="lp-ico"><Icon name={i} size={20} /></span><span><b>{t} <em className="lp-soon">Em breve</em></b><span>{d}</span></span></li>)}
          </ul>
        </details>
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

      <section className="lp-section lp-founders" id="connosco">
        <div className="lp-founders-card">
          <p className="lp-badge"><Icon name="spark" size={16} />Feita em Portugal, com os salões</p>
          <h2>Ajude-nos a criar a melhor app de marcações para os salões portugueses</h2>
          <p className="lp-sub">A CorteCerto é de origem 100% portuguesa e cresce com o que os salões nos dizem. Experimente, diga-nos o que falta e veja a sua ideia chegar à app.</p>
          <ul className="lp-perks">
            {FOUNDERS.perks.map(p => <li key={p.title}><span className="lp-ico"><Icon name={p.icon} size={20} /></span><span><b>{p.title}</b><small>{p.text}</small></span></li>)}
          </ul>
          <Link to={SIGNUP} className="lp-cta lg">Quero construir convosco</Link>
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
          <h2>Um preço para toda a equipa</h2>
          <p className="lp-sub">Cerca de {perDay} por dia, com IVA. Duas faltas evitadas por mês já pagam a CorteCerto.</p>
        </div>
        <div className="lp-price-box">
          <p className="lp-plan">CorteCerto</p>
          <p className="lp-amount"><strong>{price}</strong><span>+ IVA<br />por mês</span></p>
          <p className="lp-small">{PLAN.trialDays} dias grátis, sem cartão. Fatura todos os meses no painel.</p>
          <ul className="lp-points">
            {['Marcações, clientes e profissionais sem limite', 'Página de marcação e poster com QR', 'Lembretes por WhatsApp sem custo por mensagem', 'Fila de espera, sinais por MB Way e estatísticas', '10 ferramentas de IA incluídas', 'Ajuda em português, por pessoas'].map(p => <li key={p}><Check />{p}</li>)}
          </ul>
          <Link to={SIGNUP} className="lp-cta lg block">Criar o meu salão grátis</Link>
          <p className="lp-guarantee"><Icon name="shield" size={16} />Sem fidelização. Cancela quando quiser e leva os seus dados.</p>
        </div>
        <div className="lp-price-side">
          <div className="lp-compare">
            <h3>Porque é diferente</h3>
            <table>
              <thead><tr><th></th><th>CorteCerto</th><th>Outras plataformas habituais</th></tr></thead>
              <tbody>
                <tr><th>1, 3 ou 5 profissionais</th><td>{price} + IVA, sempre</td><td>O preço sobe com cada pessoa</td></tr>
                <tr><th>Comissão sobre clientes novos</th><td>0%</td><td>Até 25% da primeira marcação</td></tr>
                <tr><th>Lembrete ao cliente</th><td>Do WhatsApp do salão, sem custo</td><td>Notificação ou SMS da plataforma</td></tr>
                <tr><th>Os clientes</th><td>São do salão. Exporta em Excel</td><td>Também ficam no marketplace</td></tr>
              </tbody>
            </table>
          </div>
          <div className="lp-after-trial">
            <h3>Ao fim dos {PLAN.trialDays} dias</h3>
            <ol>
              <li>Avisamos antes de acabar. Nada é cobrado sozinho, porque não pedimos cartão.</li>
              <li>Se quiser continuar, paga {price} + IVA por MB Way ou transferência e recebe a fatura no painel.</li>
              <li>Se não pagar, o painel fica só de leitura {GRACE_DAYS} dias depois. Os seus dados continuam lá e pode sempre exportá-los.</li>
            </ol>
          </div>
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
          {FAQ.map(([q, a], i) => <details key={q} open={i < FAQ_OPEN}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="lp-final">
        <h2>A próxima cadeira vazia pode ser a última.</h2>
        <p>Crie o seu salão em 15 minutos e partilhe o link ainda hoje.</p>
        <div className="lp-cta-row center">
          <Link to={SIGNUP} className="lp-cta lg light">{trial}</Link>
          <a href="#demonstracao" className="lp-ghost light">Pedir demonstração</a>
        </div>
        <p className="lp-final-note">Sem cartão · Sem fidelização · {price} + IVA por mês depois</p>
      </section>

      <div className={`lp-sticky ${pastHero ? 'show' : ''}`}><Link to={SIGNUP} className="lp-cta block">{trial}</Link></div>

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
