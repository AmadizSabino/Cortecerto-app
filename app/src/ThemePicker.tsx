import { THEMES, themeStyle } from './lib/themes'

/** A grid of theme swatches. Shows the salon type's themes first, then the rest on demand. */
export default function ThemePicker({ value, type, onChange, showAll }: {
  value: string; type: string; onChange: (id: string) => void; showAll?: boolean
}) {
  const list = showAll ? THEMES : THEMES.filter(t => t.type === type)
  return (
    <div className="themes">
      {list.map(t => (
        <button type="button" key={t.id} style={themeStyle(t)} className={t.id === value ? 'theme-swatch on' : 'theme-swatch'} onClick={() => onChange(t.id)}>
          <span className="sw-name">{t.name}</span>
          <span className="sw-btn">Marcar</span>
        </button>
      ))}
    </div>
  )
}
