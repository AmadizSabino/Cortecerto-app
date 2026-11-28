/** Requests waiting for the salon, by kind (components/PendingRequests.tsx shows them on Hoje). */
export interface PendingCounts { packages: number; packs: number; club: number }

/** One line per kind of request still waiting for the salon, newest kinds first. Empty kinds are left out. */
export function pendingLines(c: PendingCounts): { to: string; icon: string; title: string; hint: string }[] {
  const out: { to: string; icon: string; title: string; hint: string }[] = []
  if (c.packages) out.push({ to: '/pacotes#pedidos', icon: 'gift', title: c.packages === 1 ? '1 pedido de pacote por responder' : `${c.packages} pedidos de pacote por responder`, hint: 'Faça a proposta e envie por WhatsApp.' })
  if (c.packs) out.push({ to: '/pacotes#packs', icon: 'gift', title: c.packs === 1 ? '1 pack de sessões por pagar' : `${c.packs} packs de sessões por pagar`, hint: 'Ative quando receber o pagamento.' })
  if (c.club) out.push({ to: '/clube', icon: 'crown', title: c.club === 1 ? '1 pedido para aderir ao clube' : `${c.club} pedidos para aderir ao clube`, hint: 'Ative quando receber a primeira mensalidade.' })
  return out
}

