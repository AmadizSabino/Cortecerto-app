import { useState } from 'react'
import { euros } from '../../lib/supabase'
import { openInvoice, STATUS_LABEL, type Invoice } from '../../lib/invoices'
import { docDetail, documentRows, type DocFilter, type DocRow } from '../../lib/money'

const ptDate = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('pt-PT') : '—'
const FILTERS: [DocFilter, string][] = [['todos', 'Todos'], ['pedidos', 'Pedidos de pagamento'], ['faturas', 'Faturas'], ['sem_fatura', 'Pagos sem fatura']]
const PAGE = 30

export function DocTags({ r }: { r: DocRow }) {
  const st = r.inv.status ?? 'por_pagar'
  return (
    <>
      <span className={`tag ${r.kind === 'pedido' ? 'pendente' : 'concluida'}`}>{r.kind === 'pedido' ? 'Pedido' : 'Fatura'}</span>
      <span className={`tag ${st === 'paga' ? 'concluida' : st === 'anulada' ? 'cancelada' : 'faltou'}`}>{STATUS_LABEL[st]}</span>
      {r.needsInvoice && <span className="tag faltou">Falta a fatura</span>}
    </>
  )
}

/** Dinheiro > Pedidos e faturas enviados: every document sent to salons, with filters. */
export function DocumentHistory({ invoices, salons, onOpen }: { invoices: Invoice[]; salons: { id: string; name: string }[]; onOpen: (salonId: string) => void }) {
  const [filter, setFilter] = useState<DocFilter>('todos')
  const [salon, setSalon] = useState('')
  const [shown, setShown] = useState(PAGE)
  const names = new Map(salons.map(s => [s.id, s.name]))
  const rows = documentRows(invoices, filter, salon || undefined)
  const missing = documentRows(invoices, 'sem_fatura').length
  return (
    <section className="card">
      <h2>Pedidos e faturas enviados</h2>
      <div className="chips">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`chip${k === filter ? ' on' : ''}`} onClick={() => { setFilter(k); setShown(PAGE) }}>
            {label}{k === 'sem_fatura' && missing > 0 ? ` (${missing})` : ''}
          </button>
        ))}
      </div>
      <label>Salão
        <select value={salon} onChange={e => { setSalon(e.target.value); setShown(PAGE) }}>
          <option value="">Todos os salões</option>
          {[...salons].sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {filter === 'sem_fatura' && <p className="muted small">Pedidos já pagos para os quais ainda não carregou a fatura-recibo do seu programa de faturação. Carregue-a na página do salão, em "Fatura-recibo de um pedido já pago".</p>}
      {rows.length === 0 && <p className="muted">Nada para mostrar.</p>}
      <ul className="history docs">
        {rows.slice(0, shown).map(r => (
          <li key={r.inv.id}>
            <span className="muted">{ptDate(r.inv.issued_on)}</span>
            <span>
              <button className="link" style={{ marginTop: 0 }} onClick={() => onOpen(r.inv.salon_id)}>{names.get(r.inv.salon_id) ?? 'Salão'}</button>
              {' · '}<b>{r.inv.number}</b>{r.inv.period && ` · ${r.inv.period}`} · {euros(r.inv.amount_cents)}
              <small className="muted"><br />{docDetail(r)}</small>
            </span>
            <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <DocTags r={r} />
              <button className="link" style={{ marginTop: 0 }} onClick={() => openInvoice(r.inv)}>Abrir PDF</button>
            </span>
          </li>
        ))}
      </ul>
      {rows.length > shown && <button className="btn ghost" onClick={() => setShown(shown + PAGE)}>Ver mais ({rows.length - shown})</button>}
    </section>
  )
}
