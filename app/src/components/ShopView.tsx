import { useState } from 'react'
import Icon, { WhatsAppIcon } from './Icon'
import ProductPhoto from './ProductPhoto'
import { euros, supabase, type Salon } from '../lib/supabase'
import { formatPhone, waLink } from '../lib/whatsapp'
import { shopError, type Product, type ProductPay } from '../lib/shop'

interface Done { product: Product; qty: number; pay: ProductPay }

/**
 * The salon's shop on the client page (migration 0032): the client reserves a product and picks it
 * up in the salon. Paid in the salon, or by MB WAY to the salon's number when the salon asks for it.
 * `compact`: the short "Levar na visita" strip after a booking, with the client's details known.
 */
export default function ShopView({ salon, products, left = {}, client, compact = false, onAll }: {
  salon: Salon; products: Product[]; left?: Record<string, number>; client?: { name: string; phone: string }
  compact?: boolean; onAll?: () => void
}) {
  const [open, setOpen] = useState<Product | null>(null)
  const [qty, setQty] = useState(1)
  const [name, setName] = useState(client?.name ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done[]>([])
  const [copied, setCopied] = useState(false)

  // Units left (migration 0033): none counts as sold out; a few are shown as the last ones.
  const out = (p: Product) => p.sold_out || left[p.id] === 0
  const maxQty = (p: Product) => Math.max(1, Math.min(10, left[p.id] ?? 10))
  const [stockNow, setStockNow] = useState(left)
  const leftOf = (p: Product) => stockNow[p.id] ?? left[p.id]
  const list = compact ? products.filter(p => !out(p)).slice(0, 3) : products
  if (list.length === 0) return null
  const mbway = salon.mbway_number ? formatPhone(salon.mbway_number).replace('+351 ', '') : null
  const last = done[done.length - 1]

  function pick(p: Product) {
    setOpen(p); setQty(1); setError(''); setNote('')
  }

  async function reserve(e: React.FormEvent) {
    e.preventDefault()
    if (!open) return
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('reserve_product', { p_product: open.id, p_qty: qty, p_name: name, p_phone: phone, p_note: note || null })
    setBusy(false)
    if (error) { setError(shopError(error.message)); return }
    const row = (data ?? [])[0] as { id: string; pay: ProductPay } | undefined
    if (row) fetch('/api/notify-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }), keepalive: true }).catch(() => {})
    setDone(d => [...d, { product: open, qty, pay: row?.pay ?? open.pay }])
    if (leftOf(open) != null) setStockNow(st => ({ ...st, [open.id]: Math.max(0, (st[open.id] ?? left[open.id]) - qty) }))
    setOpen(null)
  }

  const sheet = open && (
    <div className="style-sheet-wrap" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
      <form className="style-sheet product-sheet" onClick={e => e.stopPropagation()} onSubmit={reserve}>
        <button type="button" className="style-close" aria-label="Fechar" onClick={() => setOpen(null)}><Icon name="x" size={20} /></button>
        <ProductPhoto path={open.photo_path} name={open.name} className="product-hero" />
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <h2 style={{ margin: 0 }}>{open.name}</h2>
          <b className="price">{euros(open.price_cents)}</b>
        </div>
        {open.description && <p className="muted" style={{ margin: '6px 0 0' }}>{open.description}</p>}
        <div className="qty" role="group" aria-label="Quantidade">
          <button type="button" aria-label="Menos" disabled={qty <= 1} onClick={() => setQty(q => q - 1)}>−</button>
          <b aria-live="polite">{qty}</b>
          <button type="button" aria-label="Mais" disabled={qty >= maxQty(open)} onClick={() => setQty(q => q + 1)}>+</button>
          <span className="muted small grow" style={{ textAlign: 'right' }}>Total <b>{euros(open.price_cents * qty)}</b></span>
        </div>
        {!client && <>
          <label>Nome<input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></label>
          <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="912 345 678" /></label>
        </>}
        <label><span>Mensagem para o salão <span className="muted">(opcional)</span></span><input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Ex.: Levo na visita de sexta." /></label>
        <p className="pay-note small">
          <Icon name={open.pay === 'mbway' && mbway ? 'phone' : 'bag'} size={16} />
          <span>{open.pay === 'mbway' && mbway
            ? <>Paga <b>por MB WAY</b> ao salão, a seguir à reserva. Levanta no salão.</>
            : <>Reserva agora e <b>paga no salão</b> quando o levantar.</>}</span>
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'A reservar…' : `Reservar · ${euros(open.price_cents * qty)}`}</button>
        <p className="muted small" style={{ textAlign: 'center', margin: '8px 0 0' }}>Os seus dados servem só para o salão guardar a reserva. <a href="/privacidade" target="_blank" rel="noreferrer">Privacidade</a></p>
      </form>
    </div>
  )

  const confirmation = last && (
    <div className={compact ? 'card soft shop-done' : 'card raised shop-done'}>
      <div className="between"><b><Icon name="check" size={18} /> Reservado: {last.qty > 1 ? `${last.qty} × ` : ''}{last.product.name}</b></div>
      {last.pay === 'mbway' && mbway ? <>
        <p className="small" style={{ margin: '6px 0 8px' }}>Envie <b>{euros(last.product.price_cents * last.qty)}</b> por MB WAY para o salão. Fica à sua espera no {salon.name}.</p>
        <div className="between">
          <b style={{ fontSize: '1.2rem', letterSpacing: '.04em' }}>{mbway}</b>
          <button type="button" className="sm" onClick={() => { navigator.clipboard?.writeText(salon.mbway_number!); setCopied(true) }}>
            <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </> : <p className="small" style={{ margin: '6px 0 0' }}>Fica à sua espera no {salon.name}. Paga <b>{euros(last.product.price_cents * last.qty)}</b> quando o levantar.</p>}
      {!compact && salon.whatsapp && <a className="btn ghost inline sm" style={{ marginTop: 10 }} href={waLink(salon.whatsapp, `Olá! Acabei de reservar ${last.qty > 1 ? `${last.qty} × ` : ''}${last.product.name} na vossa loja. Nome: ${name}.`)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Avisar o salão por WhatsApp</a>}
    </div>
  )

  if (compact) return (
    <section className="card shop-addon" aria-label="Levar na visita">
      <h3 style={{ margin: 0 }}>Quer levar alguma coisa na visita?</h3>
      <p className="muted small" style={{ margin: '4px 0 10px' }}>O salão guarda-lhe o produto. Não paga nada agora{products.some(p => p.pay === 'mbway') && mbway ? ', exceto se o salão pedir MB WAY' : ''}.</p>
      {confirmation}
      <div className="addon-list">
        {list.map(p => (
          <button key={p.id} className="addon" onClick={() => pick(p)}>
            <ProductPhoto path={p.photo_path} name={p.name} className="addon-photo" />
            <span className="grow"><span className="t">{p.name}</span><small className="muted">{euros(p.price_cents)}</small></span>
            <span className="addon-plus" aria-hidden="true"><Icon name="plus" size={18} /></span>
          </button>
        ))}
      </div>
      {onAll && products.length > list.length && <button className="link" style={{ marginTop: 8 }} onClick={onAll}>Ver todos os produtos ({products.length})</button>}
      {sheet}
    </section>
  )

  return (
    <section aria-label="Loja">
      <div className="step-title"><h2>Produtos do salão</h2></div>
      <p className="muted small" style={{ margin: '-4px 0 10px' }}>Reserve aqui e leve na próxima visita. {mbway && products.some(p => p.pay === 'mbway') ? 'Paga no salão ou por MB WAY, conforme o produto.' : 'Paga no salão quando o levantar.'}</p>
      {confirmation}
      <div className="shop-grid">
        {list.map(p => (
          <button key={p.id} className={`product-card${out(p) || leftOf(p) === 0 ? ' sold-out' : ''}`} disabled={out(p) || leftOf(p) === 0} onClick={() => pick(p)}>
            <ProductPhoto path={p.photo_path} name={p.name} />
            <span className="product-info">
              <span className="t">{p.name}</span>
              <span className="price">{euros(p.price_cents)}</span>
              {out(p) || leftOf(p) === 0 ? <small className="muted">Esgotado</small>
                : leftOf(p) != null && leftOf(p) <= 3 ? <small className="reserve">Reservar · {leftOf(p) === 1 ? 'última unidade' : `últimas ${leftOf(p)}`}</small>
                : <small className="reserve">Reservar</small>}
            </span>
          </button>
        ))}
      </div>
      {sheet}
    </section>
  )
}
