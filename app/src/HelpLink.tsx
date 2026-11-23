import { Link, useLocation } from 'react-router-dom'
import Icon from './components/Icon'

/** The "?" next to a panel screen's title: opens Ajuda on this screen's how-tos. */
export default function HelpLink({ screen }: { screen?: string }) {
  const { pathname } = useLocation()
  const s = screen ?? pathname
  return (
    <Link to={`/ajuda?ecra=${encodeURIComponent(s)}`} className="help-link no-print" aria-label="Ajuda sobre este ecrã" title="Ajuda">
      <Icon name="help" size={20} />
    </Link>
  )
}
