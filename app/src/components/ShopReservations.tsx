import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { heldUnits, lowStock, type Order, type Product } from '../lib/shop'

/**
 * On Hoje: products clients reserved and haven't picked up (migration 0032), and products running
 * out (migration 0033).
 */
export default function ShopReservations({ salonId }: { salonId: string }) {
  const [open, setOpen] = useState<{ n: number; mbway: number } | null>(null)
  const [low, setLow] = useState<(Product & { left: number })[]>([])
  useEffect(() => {
    (async () => {
      const [o, p] = await Promise.all([
        supabase.from('product_orders').select('product_id,qty,status,pay').eq('salon_id', salonId).in('status', ['reservado', 'pago']),
        supabase.from('products').select('*').eq('salon_id', salonId).eq('active', true).not('stock', 'is', null),
      ])
      if (o.error || !o.data) return
      const rows = o.data as Pick<Order, 'product_id' | 'qty' | 'status' | 'pay'>[]
      setOpen({ n: rows.length, mbway: rows.filter(r => r.status === 'reservado' && r.pay === 'mbway').length })
      if (!p.error && p.data) setLow(lowStock(p.data as Product[], heldUnits(rows)))
    })()
  }, [salonId])
  return <>
    {open && open.n > 0 && (
      <Link className="card shop-card-hoje" to="/loja#reservas">
        <span className="avatar" aria-hidden="true"><Icon name="bag" size={22} /></span>
        <span className="grow">
          <b>{open.n === 1 ? '1 produto reservado' : `${open.n} produtos reservados`} na loja</b><br />
          <small className="muted">{open.mbway ? `${open.mbway} com MB WAY por confirmar · ` : ''}Entregue quando o cliente vier.</small>
        </span>
        <Icon name="chevronRight" size={18} />
      </Link>
    )}
    {low.length > 0 && (
      <Link className="card shop-card-hoje" to="/loja#stock">
        <span className="avatar warn-avatar" aria-hidden="true"><Icon name="bag" size={22} /></span>
        <span className="grow">
          <b>Pouco stock: {low.length === 1 ? low[0].name : `${low.length} produtos`}</b><br />
          <small className="muted">{low.slice(0, 3).map(p => `${p.name} (${p.left === 0 ? 'acabou' : p.left})`).join(' · ')}{low.length > 3 ? '…' : ''}</small>
        </span>
        <Icon name="chevronRight" size={18} />
      </Link>
    )}
  </>
}
