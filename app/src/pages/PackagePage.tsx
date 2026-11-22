import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { euros, supabase, type Salon } from '../lib/supabase'
import { mediaUrl, type Photo } from '../lib/brand'
import { comboTotals, eventEstimate, priceLabel, type Package, type PackageItem, type Svc } from '../lib/packages'
import { clientTheme, themeById, themeStyle } from '../lib/themes'
import { formatPhone } from '../lib/whatsapp'

const ERRORS: Record<string, string> = {
  dados_cliente: 'Indique o seu nome e um telemóvel válido.',
  data_invalida: 'Escolha uma data a partir de hoje.',
  convidados_invalidos: 'Esse número de pessoas não é possível neste pacote.',
  pacote_invalido: 'Este pacote já não está disponível.',
}
const errorText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? 'Não foi possível enviar. Tente de novo.'

/**
 * /s/<salon>/pacote/<id>: one package, with photos of previous work. A combo goes on
 * to the normal booking (extras chosen here); an event sends a request for a proposal;
 * a pack is asked for and paid to the salon.
 */
export default function PackagePage() {
  const { slug = '', id = '' } = useParams()
  const nav = useNavigate()
  const [salon, setSalon] = useState<Salon | null>()
  const [pkg, setPkg] = useState<Package | null>(null)
  const [items, setItems] = useState<PackageItem[]>([])
  const [services, setServices] = useState<Record<string, Svc>>({})
  const [photos, setPhotos] = useState<Photo[]>([])
  const [extras, setExtras] = useState<string[]>([])
  const [f, setF] = useState({ name: '', phone: '', consent: false, date: '', time: '', place: 'salao', address: '', guests: '0', message: '' })
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('slug', slug).maybeSingle()
      setSalon(s)
      if (!s) return
      const { data: k } = await supabase.from('packages').select('*').eq('id', id).eq('salon_id', s.id).eq('active', true).maybeSingle()
      setPkg(k as Package | null)
      if (!k) return
      const [it, sv, ph] = await Promise.all([
        supabase.from('package_items').select('*').eq('package_id', id).order('position'),
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id).eq('active', true),
        supabase.from('salon_photos').select('id,path,caption,position').eq('package_id', id).order('position'),
      ])
      setItems((it.data ?? []) as PackageItem[])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      setPhotos((ph.data ?? []) as Photo[])
      document.title = `${(k as Package).name} · ${s.name}`
    })()
  }, [slug, id])

  const totals = useMemo(() => pkg ? comboTotals(pkg, items, services, extras) : null, [pkg, items, services, extras])
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (!salon || !pkg) return <main className="page"><h1>Pacote não encontrado</h1><p><Link to={`/s/${slug}`}>Ver o salão</Link></p></main>

  const theme = themeById(clientTheme(slug) ?? salon.theme)
  const included = items.filter(i => !i.optional && services[i.service_id])
  const optional = items.filter(i => i.optional && services[i.service_id])
  const guests = Math.max(0, Number(f.guests) || 0)
  const estimate = eventEstimate(pkg, guests, items, services, extras)
  const cover = mediaUrl(pkg.image_path ?? photos[0]?.path)

  async function send(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSending(true)
    const r = pkg!.mode === 'evento'
      ? await supabase.rpc('request_package', {
        p_package: pkg!.id, p_name: f.name, p_phone: f.phone, p_consent: f.consent, p_date: f.date, p_time: f.time || null,
        p_place: f.place, p_address: f.address || null, p_guests: guests, p_extras: extras, p_message: f.message || null,
      })
      : await supabase.rpc('buy_pack', { p_package: pkg!.id, p_name: f.name, p_phone: f.phone })
    setSending(false)
    if (r.error) { setError(errorText(r.error.message)); return }
    setDone(String(r.data))
    window.scrollTo(0, 0)
  }

  return (
    <div className="themed" style={themeStyle(theme)}><main className="page">
      <p><Link to={`/s/${slug}`}>‹ {salon.name}</Link></p>
      {cover && <img className="brand-preview cover" src={cover} alt="" />}
      <h1 style={{ marginBottom: 4 }}>{pkg.name}</h1>
      <p className="price-big"><b>{pkg.mode === 'combo' && totals ? euros(totals.price) : priceLabel(pkg, euros)}</b>
        {pkg.mode === 'combo' && totals && totals.saving > 0 && <small className="ok"> · poupa {euros(totals.saving)}</small>}</p>
      {pkg.description && <p className="about">{pkg.description}</p>}

      {done ? (
        <div className="card">
          {pkg.mode === 'evento' ? <>
            <h2 style={{ marginTop: 0 }}>Pedido enviado!</h2>
            <p>O {salon.name} vai preparar a proposta e envia-lha por WhatsApp. Pode ver o estado do pedido aqui:</p>
            <p><Link className="btn" to={`/pedido/${done}`}>Ver o meu pedido</Link></p>
          </> : <>
            <h2 style={{ marginTop: 0 }}>Pedido do pack enviado!</h2>
            <p>{salon.mbway_number ? <>Envie {euros(pkg.price_cents)} por MB Way para <b>{formatPhone(salon.mbway_number)}</b>. O salão ativa o pack quando receber e cada visita desconta uma sessão.</> : 'Pague o pack na próxima visita. Depois, cada visita desconta uma sessão.'}</p>
          </>}
        </div>
      ) : <>
        {photos.length > 0 && <div className="gallery-strip">{photos.map(p => <img key={p.id} src={mediaUrl(p.path)!} alt={p.caption ?? ''} loading="lazy" style={{ width: 140, height: 170, objectFit: 'cover', borderRadius: 12 }} />)}</div>}

        <section className="card">
          <b>{pkg.mode === 'pack' ? `${pkg.sessions} sessões de` : 'Inclui'}</b>
          <ul className="small">{included.map(i => <li key={i.id}>{services[i.service_id].name}</li>)}
            {pkg.mode === 'evento' && pkg.includes_trial && <li>Prova antes do dia</li>}
            {pkg.mode === 'evento' && pkg.per_guest_cents ? <li>Acompanhantes: {euros(pkg.per_guest_cents)} por pessoa</li> : null}
            {pkg.mode === 'pack' && pkg.valid_days ? <li>Válido {pkg.valid_days} dias depois de ativado</li> : null}
          </ul>
          {optional.length > 0 && pkg.mode !== 'pack' && <>
            <b className="small">Pode juntar</b>
            {optional.map(i => (
              <label key={i.id} className="check"><input type="checkbox" checked={extras.includes(i.id)} onChange={e => setExtras(x => e.target.checked ? [...x, i.id] : x.filter(y => y !== i.id))} />
                {services[i.service_id].name} · +{euros(i.extra_price_cents ?? services[i.service_id].price_cents)}</label>
            ))}
          </>}
          {pkg.mode === 'combo' && totals && <p className="small muted" style={{ marginBottom: 0 }}>Cerca de {totals.minutes} min, tudo na mesma visita.</p>}
        </section>

        {pkg.mode === 'combo' && (
          <button className="btn" onClick={() => nav(`/s/${slug}?combo=${pkg.id}${extras.length ? `&extras=${extras.join(',')}` : ''}`)}>Escolher dia e hora</button>
        )}

        {pkg.mode !== 'combo' && (
          <form className="card" onSubmit={send}>
            {pkg.mode === 'evento' && <>
              <h2 style={{ marginTop: 0 }}>Pedir proposta</h2>
              <div className="row">
                <label style={{ flex: 2 }}>Data do evento<input type="date" required value={f.date} min={new Date().toISOString().slice(0, 10)} onChange={e => setF({ ...f, date: e.target.value })} /></label>
                <label style={{ flex: 1 }}>Hora <span className="muted">(opc.)</span><input type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></label>
              </div>
              <label>Onde
                <select value={f.place} onChange={e => setF({ ...f, place: e.target.value })}>
                  <option value="salao">No salão</option><option value="local">No local (casa, quinta, hotel)</option>
                </select>
              </label>
              {f.place === 'local' && <label>Morada ou nome do local<input value={f.address} maxLength={200} onChange={e => setF({ ...f, address: e.target.value })} /></label>}
              <label>Acompanhantes <span className="muted">(além de si{pkg.max_guests != null ? `, até ${pkg.max_guests}` : ''})</span>
                <input type="number" min={0} max={pkg.max_guests ?? 30} value={f.guests} onChange={e => setF({ ...f, guests: e.target.value })} /></label>
              <label><span>Mensagem <span className="muted">(opcional)</span></span><textarea rows={3} maxLength={600} value={f.message} placeholder="Ex.: casamento às 15h, cerimónia na igreja de…" onChange={e => setF({ ...f, message: e.target.value })} /></label>
              <p className="small"><b>Estimativa: {euros(estimate)}</b> <span className="muted">· o valor final vem na proposta do salão</span></p>
            </>}
            {pkg.mode === 'pack' && <h2 style={{ marginTop: 0 }}>Comprar o pack · {euros(pkg.price_cents)}</h2>}
            <label>Nome<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
            <label>Telemóvel<input required inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="912 345 678" /></label>
            {pkg.mode === 'evento' && <label className="check"><input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} /><span>Aceito receber novidades e promoções do salão por WhatsApp. <span className="muted">(opcional)</span></span></label>}
            <p className="muted small">Os seus dados servem para o salão tratar o pedido. <a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a></p>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" disabled={sending}>{sending ? 'A enviar…' : pkg.mode === 'evento' ? 'Enviar pedido' : 'Pedir o pack'}</button>
          </form>
        )}
      </>}
    </main></div>
  )
}
