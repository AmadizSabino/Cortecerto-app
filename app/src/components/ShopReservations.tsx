import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { supabase } from '../lib/supabase'

/** On Hoje: products clients reserved in the shop and haven't picked up yet (migration 0032). */
export default function ShopReservations({ salonId }: { salonId: string }) {
  const [open, setOpen] = useState<{ n: number; mbway: number } | null>(null)
  useEffect(() => {
    supabase.from('product_orders').select('status,pay').eq('salon_id', salonId).in('status', ['reservado', 'pago'])
      .then(({ data, error }) => {
        if (error || !data) return
        const rows = data as { status: string; pay: string }[]
        setOpen({ n: rows.length, mbway: rows.filter(r => r.status === 'reservado' && r.pay === 'mbway').length })
      })
  }, [salonId])
  if (!open?.n) return null
  return (
    <Link className="card shop-card-hoje" to="/loja#reservas">
      <span className="avatar" aria-hidden="true"><Icon name="bag" size={22} /></span>
      <span className="grow">
        <b>{open.n === 1 ? '1 produto reservado' : `${open.n} produtos reservados`} na loja</b><br />
        <small className="muted">{open.mbway ? `${open.mbway} com MB WAY por confirmar · ` : ''}Entregue quando o cliente vier.</small>
      </span>
      <Icon name="chevronRight" size={18} />
    </Link>
  )
}
