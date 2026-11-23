import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { euros, supabase } from '../lib/supabase'
import { LEGAL_DOCS } from '../lib/legal'
import { PLAN } from '../lib/plan'
import { track } from '../lib/track'

const DAY = [
  { time: '09:00', title: 'Os lembretes de amanhã saem em dois minutos', text: 'Abre "Lembretes", toca em cada cliente e o WhatsApp abre com a mensagem pronta.' },
  { time: '11:40', title: 'Quem não pode vir, muda a hora sozinho', text: 'O link do lembrete deixa o cliente escolher outro horário livre. A vaga fica disponível para outro.' },
  { time: '15:15', title: 'Entra alguém sem marcação', text: 'Lê o QR à porta, entra na fila e vê quantas pessoas tem à frente. Chama-o por WhatsApp quando for a vez.' },
  { time: '19:30', title: 'A próxima visita fica marcada antes de sair', text: 'Ao fechar um corte, a app sugere o mesmo serviço daqui a três semanas, à hora do costume.' },
]

const FEATURES = [
  ['Página de marcação com o seu nome', 'Um link para a bio do Instagram e o perfil do Google, e um poster com QR para o balcão.'],
  ['Agenda do dia e da semana', 'Confirmar, concluir, registar faltas e sinais, e criar marcações de telefone ou ao balcão.'],
  ['Clientes que voltam', 'Histórico, notas ("degradê baixo, máquina 1"), aniversários e quem não vem há mais de 45 dias.'],
  ['Equipa e horários', 'Horário e pausa de cada profissional, folgas, férias e preços diferentes por pessoa.'],
  ['Sinal por MB Way', 'O dinheiro vai direto para o MB Way do salão. Nós nunca tocamos nele.'],
  ['Números do mês', 'Faturado, valor médio, taxa de faltas e clientes novos, sem folhas de Excel.'],
]

const FAQ = [
  ['Os meus clientes precisam de instalar alguma coisa?', 'Não. Marcam numa página web, a partir do link ou do QR. Só o salão pode, se quiser, instalar a CorteCerto no telemóvel como uma app.'],
  ['As mensagens de WhatsApp têm custo?', 'Não. A app abre o WhatsApp do salão com a mensagem escrita e é o salão que a envia.'],
  ['Onde ficam os dados dos clientes?', 'Em servidores na União Europeia. Os dados são do salão: pode exportá-los ou apagar os de um cliente que o peça, a qualquer momento.'],
  ['E se eu quiser sair?', 'Cancela quando quiser, sem fidelização. Antes disso descarrega os seus clientes e marcações em Excel.'],
]

/** Public home page: what CorteCerto does for a salon, the price, and how to start. */
export default function LandingPage() {
  const price = euros(PLAN.priceCents).replace(/,00(?=\s?€)/, '')
  // A salon that is signed in goes straight to its panel.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSignedIn(Boolean(data.session)); if (!data.session) track('visita', { page: 'site', key: 'site' }) }) }, [])
  if (signedIn) return <Navigate to="/painel" replace />
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="lp-brand"><img src="/icon.svg" alt="" width={28} height={28} />CorteCerto</Link>
        <Link to="/painel" className="lp-login">Entrar</Link>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1>Menos faltas. Mais cadeiras ocupadas.</h1>
          <p className="lp-lead">Marcações online, lembretes por WhatsApp e fila de espera para barbearias, cabeleireiros, unhas e depilação. Feito em Portugal, para salões portugueses.</p>
          <div className="lp-cta-row">
            <Link to="/painel" className="lp-cta">Experimentar {PLAN.trialDays} dias grátis</Link>
            <span className="lp-cta-note">Sem cartão. Fica pronto em 15 minutos.</span>
          </div>
        </div>

        <div className="lp-phone" aria-label="Exemplo de conversa de lembrete no WhatsApp">
          <div className="lp-chat-head"><span className="lp-avatar">BR</span><span><strong>Barbearia do Rui</strong><small>online</small></span></div>
          <div className="lp-chat">
            <p className="lp-msg out">Olá Tiago! Lembramos a sua marcação de Corte + barba amanhã, quinta, às 18:30. Se não puder vir, mude aqui: link.pt/m/a1b2<small>20:02</small></p>
            <p className="lp-msg in">Amanhã não dá, já passei para sexta às 10h 👍<small>20:05</small></p>
            <p className="lp-event">A vaga de quinta às 18:30 ficou livre</p>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <h2>Um dia no salão, com a CorteCerto</h2>
        <ol className="lp-day">
          {DAY.map(d => (
            <li key={d.time}>
              <time>{d.time}</time>
              <div><h3>{d.title}</h3><p>{d.text}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section">
        <h2>Tudo o que o salão usa, num só sítio</h2>
        <dl className="lp-features">
          {FEATURES.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
        </dl>
      </section>

      <section className="lp-section lp-price" id="preco">
        <div>
          <h2>Um preço, tudo incluído</h2>
          <p>Sem limites de marcações, clientes ou profissionais. {PLAN.trialDays} dias grátis para experimentar com os seus clientes, sem dar o cartão.</p>
        </div>
        <div className="lp-price-box">
          <p className="lp-amount"><strong>{price}</strong> + IVA por mês</p>
          <p className="lp-small">Com fatura todos os meses, disponível no painel.{PLAN.provisional && ' Preço de lançamento.'}</p>
          <Link to="/painel" className="lp-cta">Criar o meu salão</Link>
        </div>
      </section>

      <section className="lp-section">
        <h2>Perguntas frequentes</h2>
        <div className="lp-faq">
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <footer className="lp-foot">
        <span>CorteCerto</span>
        <nav>{LEGAL_DOCS.map(d => <Link key={d.id} to={d.path}>{d.title}</Link>)}</nav>
      </footer>
    </div>
  )
}
