import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { pendingLines, type PendingCounts } from '../lib/pendingRequests'

/**
 * On Hoje: requests clients sent that sit in other screens (Pacotes, Clube), so the owner sees them
 * straight away. Requests for a taken time already show on Hoje (SlotRequests), shop reservations too.
 */
export default function PendingRequests({ salonId, packages, club }: { salonId: string; packages: boolean; club: boolean }) {
  const [counts, setCounts] = useState<PendingCounts | null>(null)
  useEffect(() => {
    const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('salon_id', salonId).eq('status', 'pedido')
      .then(({ count, error }) => error ? 0 : count ?? 0)
    Promise.all([packages ? count('package_requests') : 0, packages ? count('client_packs') : 0, club ? count('club_members') : 0])
      .then(([a, b, c]) => setCounts({ packages: a, packs: b, club: c }))
  }, [salonId, packages, club])
  if (!counts) return null
  return <>
    {pendingLines(counts).map(l => (
      <Link key={l.to} className="card shop-card-hoje" to={l.to}>
        <span className="avatar warn-avatar" aria-hidden="true"><Icon name={l.icon} size={22} /></span>
        <span className="grow"><b>{l.title}</b><br /><small className="muted">{l.hint}</small></span>
        <Icon name="chevronRight" size={18} />
      </Link>
    ))}
  </>
}
