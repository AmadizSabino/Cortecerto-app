import { createContext, useContext } from 'react'
import type { Professional, Salon, Service } from '../../lib/supabase'
import type { OpeningHours } from '../../lib/slots'

export interface PanelData {
  salon: Salon
  services: Service[]          // includes inactive ones, for history
  pros: Professional[]
  hours: OpeningHours[]
  reload: () => Promise<void>
}
export const PanelCtx = createContext<PanelData | null>(null)
export const usePanel = () => useContext(PanelCtx)!
