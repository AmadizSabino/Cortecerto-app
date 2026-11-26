import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { euros, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { parseEuros } from '../lib/onboarding'
import { removeMedia, uploadMedia } from '../lib/brand'
import { lockState, type BillingFields } from '../lib/billing'
import { themeById, themeStyle } from '../lib/themes'
import { formatPhone, waLink, waNumber } from '../lib/whatsapp'
import {
  DEFAULT_REFILL_WEEKS, isOpen, orderTotal, PAY_LABEL, readyMessage, REFILL_CHOICES, refillMessage, refillsDue,
  shopLink, shopSales, STATUS_LABEL, type Order, type Product, type ProductPay,
} from '../lib/shop'
import HelpLink from '../HelpLink'
import ProductPhoto from '../components/ProductPhoto'

interface Draft { id?: string; name: string; price: string; description: string; pay: ProductPay; refill: string; sold_out: boolean; active: boolean; photo_path: string | null }
const EMPTY: Draft = { name: '', price: '', description: '', pay: 'salao', refill: String(DEFAULT_REFILL_WEEKS), sold_out: false, active: true, photo_path: null }
const toDraft = (p: Product): Draft => ({
  id: p.id, name: p.name, price: (p.price_cents / 100).toFixed(2).replace('.', ','), description: p.description ?? '',
  pay: p.pay, refill: p.refill_weeks ? String(p.refill_weeks) : '', sold_out: p.sold_out, active: p.active, photo_path: p.photo_path,
})

/** Mais > Loja (migration 0032): products (managers), reservations and counter sales (from Receção), sales (owner). */
export default function ShopPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [missing, setMissing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftMsg, setDraftMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [sale, setSale] = useState({ product: '', qty: '1', name: '', phone: '' })
  const [saleMsg, setSaleMsg] = useState<{ ok: boolean; text: string }>()
  const [copied, setCopied] = useState(false)
  const [showOld, setShowOld] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [p, o] = await Promise.all([
      supabase.from('products').select('*').eq('salon_id', salon.id).order('position').order('created_at'),
      supabase.from('product_orders').select('*').eq('salon_id', salon.id).order('created_at', { ascending: false }).limit(2000),
    ])
    setMissing(Boolean(p.error))
    setProducts((p.data ?? []) as Product[])
    setOrders((o.data ?? []) as Order[])
    setLoaded(true)
  }, [salon])
  useEffect(() => { load() }, [load])

  const now = useMemo(() => new Date(), [orders]) // eslint-disable-line react-hooks/exhaustive-deps
  const refills = useMemo(() => refillsDue(orders, now), [orders, now])
  const month = useMemo(() => shopSales(orders, new Date(now.getTime() - 30 * 86_400_000).toISOString(), now.toISOString()), [orders, now])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'loja')) return <Navigate to="/painel" replace />

  const manager = can(role, 'lojaProdutos')
  const owner = can(role, 'revenue')
  const locked = lockState(salon as Salon & BillingFields).locked
  const link = shopLink(location.origin, salon.slug)
  const open = orders.filter(isOpen)
  const old = orders.filter(o => !isOpen(o)).slice(0, 30)
  const onSale = products.filter(p => p.active && !p.sold_out)
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { timeZone: salon.timezone, day: 'numeric', month: 'short' }).replace('.', '')
  const shareMsg = `Olá! Já pode reservar os produtos do ${salon.name} pelo telemóvel e levar na próxima visita: ${link}`

  const toForm = () => requestAnimationFrame(() => document.getElementById('produto')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  async function patch(o: Order, p: Partial<Order>) {
    const { data, error } = await supabase.from('product_orders').update(p).eq('id', o.id).select('*').single()
    if (!error && data) setOrders(os => os.map(x => x.id === o.id ? data as Order : x))
  }
  const stamp = () => new Date().toISOString()
  const markPaid = (o: Order) => patch(o, { status: 'pago', paid_at: stamp() })
  const markDelivered = (o: Order) => patch(o, { status: 'entregue', paid_at: o.paid_at ?? stamp(), delivered_at: stamp() })
  const cancel = (o: Order) => patch(o, { status: 'cancelado', cancelled_at: stamp() })
  const refillDone = (o: Order) => patch(o, { refill_sent_at: stamp() })

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault(); setDraftMsg('')
    const d = draft!
    const price = parseEuros(d.price)
    if (!d.name.trim()) { setDraftMsg('Escreva o nome do produto.'); return }
    if (isNaN(price) || price <= 0) { setDraftMsg('Indique o preço, por exemplo 14,90.'); return }
    if (d.pay === 'mbway' && !salon!.mbway_number) { setDraftMsg('Para pedir MB WAY, ponha primeiro o número MB WAY do salão em Definições.'); return }
    const row = {
      salon_id: salon!.id, name: d.name.trim(), price_cents: price, description: d.description.trim() || null, pay: d.pay,
      refill_weeks: d.refill ? Number(d.refill) : null, sold_out: d.sold_out, active: d.active, photo_path: d.photo_path,
    }
    setBusy(true)
    const { error } = d.id
      ? await supabase.from('products').update(row).eq('id', d.id)
      : await supabase.from('products').insert({ ...row, position: products.length })
    setBusy(false)
    if (error) { setDraftMsg(error.message.includes('limite_produtos') ? 'Chegou ao limite de 60 produtos.' : 'Não foi possível guardar. Tente de novo.'); return }
    const old = d.id ? products.find(p => p.id === d.id)?.photo_path : null
    if (old && old !== d.photo_path) removeMedia([old])
    setDraft(null); load()
  }

  async function pickPhoto(f: File) {
    setBusy(true); setDraftMsg('')
    try {
      const path = await uploadMedia(salon!.id, f, 'produto')
      setDraft(d => d && ({ ...d, photo_path: path }))
    } catch { setDraftMsg('Não foi possível enviar a foto. Experimente outra.') }
    setBusy(false)
  }

  async function removeProduct(p: Product) {
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) { setDraftMsg('Não foi possível retirar.'); return }
    removeMedia([p.photo_path]); setDraft(null); load()
  }

  async function sellAtCounter(e: React.FormEvent) {
    e.preventDefault(); setSaleMsg(undefined)
    const p = products.find(x => x.id === sale.product)
    const qty = Number(sale.qty)
    if (!p) { setSaleMsg({ ok: false, text: 'Escolha o produto.' }); return }
    if (sale.phone.trim() && waNumber(sale.phone).length < 11) { setSaleMsg({ ok: false, text: 'O telemóvel não parece válido.' }); return }
    const t = stamp()
    const { error } = await supabase.from('product_orders').insert({
      salon_id: salon!.id, product_id: p.id, product_name: p.name, price_cents: p.price_cents, qty,
      client_name: sale.name.trim() || 'Venda ao balcão', client_phone: sale.phone.trim(), pay: 'salao', source: 'balcao',
      status: 'entregue', paid_at: t, delivered_at: t, refill_weeks: sale.phone.trim() ? p.refill_weeks : null,
    })
    if (error) { setSaleMsg({ ok: false, text: 'Não foi possível registar.' }); return }
    setSaleMsg({ ok: true, text: `Venda registada: ${qty > 1 ? `${qty} × ` : ''}${p.name}${owner ? `, ${euros(p.price_cents * qty)}` : ''}.` })
    setSale({ product: '', qty: '1', name: '', phone: '' }); load()
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Loja<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      {missing ? <p className="banner">Para usar a Loja, corra <code>supabase/migrations/0032_shop.sql</code> no editor SQL do Supabase.</p> : <>
        <p className="muted">Os seus clientes veem os produtos na sua página, reservam e levam na visita. Pagam diretamente ao salão: no balcão ou por MB WAY. A CorteCerto não fica com nada.</p>

        <div className="stats">
          {owner
            ? <div className="stat"><b>{euros(month.revenue).replace(',00', '')}</b><span>Vendas na loja (30 dias)</span></div>
            : <div className="stat"><b>{month.units}</b><span>Unidades vendidas (30 dias)</span></div>}
          <div className="stat"><b>{open.length}</b><span>Por levantar</span></div>
          <div className="stat"><b>{onSale.length}</b><span>Produtos à venda</span></div>
        </div>

        {onSale.length > 0 && (
          <div className="card soft">
            <strong>A sua loja online</strong>
            <p style={{ margin: '4px 0 10px', wordBreak: 'break-all', fontWeight: 600 }}>{link.replace(/^https?:\/\//, '')}</p>
            <div className="actions" style={{ marginTop: 0 }}>
              <a className="wa" href={waLink('', shareMsg)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Partilhar a loja</a>
              <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true) }}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copiado' : 'Copiar link'}</button>
              <Link className="btn ghost inline sm" to={`/s/${salon.slug}?loja=1`}>Ver como cliente</Link>
              <Link className="btn ghost inline sm" to="/poster?loja=1"><Icon name="qr" size={16} />Poster com QR</Link>
            </div>
          </div>
        )}

        <h2 id="reservas">Reservas por levantar</h2>
        {loaded && open.length === 0 && <p className="muted">Sem reservas por levantar. Quando um cliente reservar na sua página, aparece aqui.</p>}
        {open.map(o => (
          <div key={o.id} className="card order">
            <div className="between">
              <span><b>{o.qty > 1 ? `${o.qty} × ` : ''}{o.product_name}</b><br /><small className="muted">{o.client_name}{o.client_phone ? ` · ${formatPhone(o.client_phone)}` : ''} · {fmt(o.created_at)}</small></span>
              <span className={`tag ${o.status === 'pago' ? 'concluida' : o.pay === 'mbway' ? 'pendente' : ''}`}>{o.status === 'pago' ? 'Pago' : o.pay === 'mbway' ? 'MB WAY por receber' : 'Paga ao levantar'}</span>
            </div>
            <p className="small" style={{ margin: '6px 0 0' }}><b>{euros(orderTotal(o))}</b>{o.qty > 1 && <span className="muted"> ({euros(o.price_cents)} cada)</span>}</p>
            {o.note && <p className="small muted" style={{ margin: '4px 0 0' }}>“{o.note}”</p>}
            {!locked && <div className="actions">
              {o.status === 'reservado' && o.pay === 'mbway' && <button className="btn-inline" onClick={() => markPaid(o)}>MB WAY recebido</button>}
              <button className={o.status === 'reservado' && o.pay === 'mbway' ? '' : 'btn-inline'} onClick={() => markDelivered(o)}><Icon name="check" size={16} />{o.status === 'pago' ? 'Entregue' : 'Entregue e pago'}</button>
              {o.client_phone && <a className="wa" href={waLink(o.client_phone, readyMessage(o, salon.name, salon.mbway_number ? formatPhone(salon.mbway_number).replace('+351 ', '') : null, euros))} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />WhatsApp</a>}
              <button className="link danger-link" onClick={() => cancel(o)}>Cancelar</button>
            </div>}
          </div>
        ))}

        {refills.length > 0 && <>
          <h2>Lembrar a reposição</h2>
          <p className="muted small" style={{ marginTop: -4 }}>Clientes que compraram há algumas semanas: o produto deve estar a acabar. Um toque abre o WhatsApp com a mensagem pronta.</p>
          {refills.map(o => (
            <div key={o.id} className="card">
              <div className="between">
                <span><b>{o.client_name}</b><br /><small className="muted">{o.product_name} · comprou a {fmt(o.paid_at!)}</small></span>
              </div>
              {!locked && <div className="actions">
                <a className="wa" href={waLink(o.client_phone, refillMessage(o, salon.name, link))} target="_blank" rel="noreferrer" onClick={() => refillDone(o)}><WhatsAppIcon size={16} />Enviar lembrete</a>
                <button className="link" onClick={() => refillDone(o)}>Não enviar</button>
              </div>}
            </div>
          ))}
        </>}

        {!locked && products.length > 0 && (
          <form className="card" onSubmit={sellAtCounter}>
            <strong>Vender no balcão</strong>
            <p className="muted small" style={{ margin: 0 }}>Registe o que vende no salão: conta nas vendas e, com o telemóvel, lembra a reposição.</p>
            <label>Produto
              <select value={sale.product} onChange={e => setSale({ ...sale, product: e.target.value })}>
                <option value="">Escolha o produto</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} · {euros(p.price_cents)}</option>)}
              </select>
            </label>
            <div className="grid2">
              <label>Quantidade<select value={sale.qty} onChange={e => setSale({ ...sale, qty: e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
              <label><span>Telemóvel <span className="muted">(opcional)</span></span><input inputMode="tel" value={sale.phone} placeholder="912 345 678" onChange={e => setSale({ ...sale, phone: e.target.value })} /></label>
            </div>
            <label><span>Cliente <span className="muted">(opcional)</span></span><input value={sale.name} maxLength={80} onChange={e => setSale({ ...sale, name: e.target.value })} /></label>
            {saleMsg && <p className={saleMsg.ok ? 'ok' : 'error'}>{saleMsg.text}</p>}
            <button className="btn-inline">Registar venda</button>
          </form>
        )}

        <div className="between" style={{ marginTop: 20 }}>
          <h2 style={{ margin: 0 }}>Produtos</h2>
          {manager && !locked && !draft && <button className="btn-inline" onClick={() => { setDraft({ ...EMPTY }); setDraftMsg(''); toForm() }}><Icon name="plus" size={16} />Adicionar produto</button>}
        </div>
        {loaded && products.length === 0 && !draft && (
          <div className="card soft">
            <b>Ainda não tem produtos.</b>
            <p className="small muted" style={{ margin: '4px 0 0' }}>{manager ? 'Comece pelos 2 ou 3 que mais recomenda: pomada, champô, óleo de barba. Uma foto tirada no salão chega.' : 'Peça ao dono ou a um gestor para adicionar os produtos.'}</p>
          </div>
        )}

        {draft && (
          <form className="card" id="produto" onSubmit={saveProduct}>
            <strong>{draft.id ? 'Editar produto' : 'Novo produto'}</strong>
            <div className="product-edit-photo">
              <ProductPhoto path={draft.photo_path} name={draft.name} />
              <label className="btn ghost inline sm" style={{ cursor: 'pointer' }}>
                <Icon name="camera" size={16} />{busy ? 'A enviar…' : draft.photo_path ? 'Trocar foto' : 'Escolher foto'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = '' }} />
              </label>
            </div>
            <label>Nome<input value={draft.name} maxLength={80} placeholder="Pomada mate" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Preço (€)<input inputMode="decimal" value={draft.price} placeholder="14,90" onChange={e => setDraft({ ...draft, price: e.target.value })} /></label>
            <label><span>Descrição <span className="muted">(opcional)</span></span><textarea rows={2} maxLength={300} value={draft.description} placeholder="Fixação forte, sem brilho. 100 ml." onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
            <fieldset className="pay-choice">
              <legend>Como o cliente paga</legend>
              <label className="check"><input type="radio" name="pay" checked={draft.pay === 'salao'} onChange={() => setDraft({ ...draft, pay: 'salao' })} /><span>{PAY_LABEL.salao}<br /><small className="muted">Reserva e paga no balcão. O mais simples.</small></span></label>
              <label className="check"><input type="radio" name="pay" checked={draft.pay === 'mbway'} disabled={!salon.mbway_number} onChange={() => setDraft({ ...draft, pay: 'mbway' })} /><span>{PAY_LABEL.mbway}<br /><small className="muted">{salon.mbway_number ? `Envia para ${formatPhone(salon.mbway_number)} ao reservar. Marca "MB WAY recebido" quando chegar.` : <>Ponha o número MB WAY do salão em <Link to="/definicoes">Definições</Link> para usar.</>}</small></span></label>
            </fieldset>
            <label>Lembrar a reposição
              <select value={draft.refill} onChange={e => setDraft({ ...draft, refill: e.target.value })}>
                <option value="">Não lembrar</option>
                {REFILL_CHOICES.map(w => <option key={w} value={w}>{w} semanas depois da compra</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={draft.sold_out} onChange={e => setDraft({ ...draft, sold_out: e.target.checked })} />Esgotado (aparece, mas não se pode reservar)</label>
            <label className="check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />Mostrar na página do salão</label>
            <p className="muted small">O preço é seu. Use o mesmo que pratica no balcão.</p>
            {draftMsg && <p className="error">{draftMsg}</p>}
            <div className="actions">
              <button className="btn-inline" disabled={busy}>Guardar</button>
              <button type="button" onClick={() => { if (!draft.id && draft.photo_path) removeMedia([draft.photo_path]); setDraft(null) }}>Cancelar</button>
              {draft.id && <button type="button" className="link danger-link" onClick={() => removeProduct(products.find(p => p.id === draft.id)!)}>Retirar produto</button>}
            </div>
          </form>
        )}

        <div className="product-list">
          {products.filter(p => p.id !== draft?.id).map(p => (
            <div key={p.id} className="card product-row">
              <ProductPhoto path={p.photo_path} name={p.name} />
              <span className="grow">
                <b>{p.name}</b><br />
                <small className="muted">{euros(p.price_cents)} · {p.pay === 'mbway' ? 'MB WAY antes' : 'paga ao levantar'}{p.refill_weeks ? ` · reposição ${p.refill_weeks} sem.` : ''}</small>
                <span className="tags" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
                  {!p.active && <span className="tag">Escondido</span>}
                  {p.sold_out && <span className="tag warn">Esgotado</span>}
                </span>
              </span>
              {manager && !locked && <button className="sm" onClick={() => { setDraft(toDraft(p)); setDraftMsg(''); toForm() }}>Editar</button>}
            </div>
          ))}
        </div>

        {old.length > 0 && <p><button className="link" onClick={() => setShowOld(!showOld)}>{showOld ? 'Esconder' : 'Ver'} vendas e reservas anteriores</button></p>}
        {showOld && old.map(o => (
          <div key={o.id} className="card row">
            <span>{o.qty > 1 ? `${o.qty} × ` : ''}{o.product_name}<br /><small className="muted">{o.client_name} · {fmt(o.paid_at ?? o.cancelled_at ?? o.created_at)}{o.source === 'balcao' ? ' · balcão' : ' · online'}</small></span>
            <span className="tags">{owner && o.status !== 'cancelado' && <b className="small">{euros(orderTotal(o))}</b>}<span className={`tag ${o.status === 'cancelado' ? 'cancelada' : 'concluida'}`}>{STATUS_LABEL[o.status]}</span></span>
          </div>
        ))}
      </>}
    </main></div>
  )
}
