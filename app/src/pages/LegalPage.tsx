import { Link } from 'react-router-dom'
import { LEGAL_DOCS, type LegalDoc } from '../lib/legal'

const fmt = (v: string) => new Date(v + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="page legal">
      <p className="banner">Rascunho para revisão jurídica. Pode ser alterado antes do lançamento.</p>
      <h1>{doc.title}</h1>
      <p className="muted">Versão de {fmt(doc.version)}</p>
      <p>{doc.intro}</p>
      {doc.sections.map(s => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
      <nav className="foot">
        {LEGAL_DOCS.filter(d => d.id !== doc.id).map(d => <p key={d.id}><Link to={d.path}>{d.title}</Link></p>)}
        <p><Link to="/">CorteCerto</Link></p>
      </nav>
    </main>
  )
}
