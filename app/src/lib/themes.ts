/** The 32 themes from the prototype, 8 per salon type. */
export interface Theme { id: string; type: string; name: string; mode: 'light' | 'dark' | 'auto'; bg: string; surface: string; ink: string; muted: string; line: string; accent: string; accentInk: string; font: 'serif' | 'sans' | 'bold' }

// id, type, name, mode, bg, surface, ink, muted, line, accent, accentInk, font
const ROWS: string[][] = [
  ["b1", "barbearia", "Clássica", "dark", "#17110D", "#231A14", "#F3E9DA", "#B9A58C", "#3A2C22", "#C08A3E", "#1A120A", "serif"],
  ["b2", "barbearia", "Moderna minimal", "light", "#F4F6F8", "#FFFFFF", "#0F1720", "#5F6B76", "#E2E6EA", "#1F5FD1", "#FFFFFF", "sans"],
  ["b3", "barbearia", "Premium escura", "dark", "#0E0E10", "#18181B", "#F2EEE6", "#A39E93", "#2A2A2E", "#D4A64A", "#17120A", "serif"],
  ["b4", "barbearia", "Urbana", "dark", "#0B0B0B", "#161616", "#FFFFFF", "#A7A7A7", "#2B2B2B", "#E52424", "#FFFFFF", "bold"],
  ["b5", "barbearia", "Vintage retro", "light", "#F3EADB", "#FBF5EA", "#2B1B12", "#7A6352", "#E2D3BD", "#8E1F2B", "#FFFFFF", "serif"],
  ["b6", "barbearia", "Desportiva", "dark", "#0A1230", "#111C42", "#EEF3FF", "#9AA8CC", "#22306A", "#C6F432", "#0A1230", "bold"],
  ["b7", "barbearia", "Cavalheiro de luxo", "dark", "#0C0C0C", "#161514", "#F4EBDD", "#A99D8C", "#2B2723", "#CDA96A", "#15110A", "serif"],
  ["b8", "barbearia", "Clara e familiar", "light", "#EEF7FB", "#FFFFFF", "#0F2A3A", "#557083", "#D6E8F0", "#1D6FE0", "#FFFFFF", "sans"],
  ["h1", "cabeleireiro", "Elegante chique", "dark", "#2A0F1F", "#3A1A2C", "#FBEFF2", "#D2B2BF", "#4E2A3D", "#F2C98B", "#2A0F1F", "serif"],
  ["h2", "cabeleireiro", "Moderna minimal", "light", "#F6F5FA", "#FFFFFF", "#1B1730", "#6A6580", "#E6E3F0", "#7B4FE0", "#FFFFFF", "serif"],
  ["h3", "cabeleireiro", "Boutique de luxo", "dark", "#0E0C0A", "#1A1714", "#F5EBDC", "#AFA28F", "#2E2924", "#E3B566", "#1A1208", "serif"],
  ["h4", "cabeleireiro", "Natural e bem-estar", "light", "#F1F4EC", "#FFFFFF", "#1F2E1F", "#5E6B58", "#DDE5D3", "#2F5D34", "#FFFFFF", "serif"],
  ["h5", "cabeleireiro", "Urbana trendy", "dark", "#0E0A14", "#1A1224", "#FFFFFF", "#B7A9C9", "#2E2140", "#FF2E9A", "#FFFFFF", "bold"],
  ["h6", "cabeleireiro", "Suave romântica", "light", "#FBF1F2", "#FFFFFF", "#3A1F27", "#8A6670", "#F1DADE", "#B8566E", "#FFFFFF", "serif"],
  ["h7", "cabeleireiro", "Profissional", "light", "#EEF6F7", "#FFFFFF", "#0E2E33", "#557478", "#D3E6E8", "#0F6670", "#FFFFFF", "sans"],
  ["h8", "cabeleireiro", "Glamour e eventos", "dark", "#3A0A12", "#4A1420", "#FFF3E6", "#DDB9AE", "#5E2230", "#E7BD6A", "#3A0A12", "serif"],
  ["n1", "unhas", "Elegante chique", "dark", "#2B0F1C", "#3B1A2A", "#FCEFF3", "#D3B3C0", "#4F2A3C", "#E7B46A", "#2B0F1C", "serif"],
  ["n2", "unhas", "Moderna minimal", "light", "#F7F6FB", "#FFFFFF", "#1C1A2C", "#6B6880", "#E8E6F1", "#8B6FE8", "#FFFFFF", "serif"],
  ["n3", "unhas", "Boutique de luxo", "dark", "#0D0B0A", "#191614", "#F6ECDF", "#B1A491", "#2F2A25", "#DDB065", "#16110A", "serif"],
  ["n4", "unhas", "Arrojada", "dark", "#120812", "#1E0F1E", "#FFFFFF", "#C9A9C6", "#3A1C38", "#FF2D95", "#FFFFFF", "bold"],
  ["n5", "unhas", "Natural e orgânica", "light", "#F3F4EC", "#FFFFFF", "#232B1C", "#626B55", "#E0E4D4", "#5C7A3A", "#FFFFFF", "serif"],
  ["n6", "unhas", "Suave romântica", "light", "#FCEEF2", "#FFFFFF", "#3D1E2A", "#8C6573", "#F3D6DF", "#C2557A", "#FFFFFF", "serif"],
  ["n7", "unhas", "Moderna e fresca", "light", "#EAF8FA", "#FFFFFF", "#0C2F36", "#4F7479", "#CDEBEF", "#0E9AAE", "#FFFFFF", "sans"],
  ["n8", "unhas", "Glamour artística", "dark", "#0B0B0C", "#171618", "#F8EEE4", "#B4A699", "#2C2A2D", "#E2B66E", "#17110A", "serif"],
  ["d1", "depilacao", "Beleza elegante", "dark", "#2C0F26", "#3C1A35", "#FCEFF7", "#D2B3C8", "#512A48", "#F5C38A", "#2C0F26", "serif"],
  ["d2", "depilacao", "Limpa e minimal", "light", "#F7F5FC", "#FFFFFF", "#1E1832", "#6C6582", "#E8E3F3", "#9B5DE5", "#FFFFFF", "serif"],
  ["d3", "depilacao", "Spa e bem-estar", "light", "#F2F4EA", "#FFFFFF", "#22301B", "#61704F", "#DEE5CF", "#557A2E", "#FFFFFF", "serif"],
  ["d4", "depilacao", "Moderna chique", "light", "#FDF0F5", "#FFFFFF", "#3A0F24", "#8E6376", "#F5D3E1", "#E0246F", "#FFFFFF", "sans"],
  ["d5", "depilacao", "Boutique de luxo", "dark", "#0E0B09", "#1A1612", "#F7EBDA", "#B3A28A", "#302921", "#E5B460", "#17110A", "serif"],
  ["d6", "depilacao", "Suave romântica", "light", "#FCF0F1", "#FFFFFF", "#3E2027", "#8D6870", "#F3DADD", "#C76A7E", "#FFFFFF", "serif"],
  ["d7", "depilacao", "Saúde da pele", "light", "#ECF7F6", "#FFFFFF", "#0D302E", "#4F7472", "#CFE8E6", "#138A85", "#FFFFFF", "sans"],
  ["d8", "depilacao", "Prática e rápida", "light", "#F5F2FD", "#FFFFFF", "#22163D", "#6D628A", "#E5DDF8", "#6D3FD6", "#FFFFFF", "sans"],
]

export const THEMES: Theme[] = ROWS.map(r => ({
  id: r[0], type: r[1], name: r[2], mode: r[3] as Theme['mode'], bg: r[4], surface: r[5], ink: r[6],
  muted: r[7], line: r[8], accent: r[9], accentInk: r[10], font: r[11] as Theme['font'],
}))

export const DEFAULT_THEME: Theme = {
  id: 'cortecerto', type: 'todos', name: 'CorteCerto', mode: 'auto', bg: '#F3F4F6', surface: '#FFFFFF', ink: '#0E1720',
  muted: '#5E6A74', line: '#E3E6EA', accent: '#0B6B66', accentInk: '#FFFFFF', font: 'sans',
}

/** The starting theme for each salon type (the owner can pick any other). */
export const TYPE_DEFAULT: Record<string, string> = { barbearia: 'b3', cabeleireiro: 'h2', unhas: 'n6', depilacao: 'd2' }

export const themeById = (id: string | null | undefined): Theme => THEMES.find(t => t.id === id) ?? DEFAULT_THEME

const FONTS = {
  serif: "'Playfair Display', Georgia, serif",
  bold: "'Bebas Neue', 'Bricolage Grotesque', Impact, sans-serif",
  sans: "'Bricolage Grotesque', system-ui, sans-serif",
}

/** CSS variables for a theme, applied on a wrapper element. */
export function themeStyle(t: Theme): React.CSSProperties {
  if (t.mode === 'auto') return {} // the app's own light/dark palette
  return {
    '--bg': t.bg, '--card': t.surface, '--fg': t.ink, '--muted': t.muted, '--line': t.line,
    '--accent': t.accent, '--accent-fg': t.accentInk, '--heading-font': FONTS[t.font],
    colorScheme: t.mode,
  } as React.CSSProperties
}

const CLIENT_KEY = 'cortecerto-theme:'
/** A client's own theme choice for one salon, kept only in their browser. */
export function clientTheme(slug: string): string | null {
  try { return localStorage.getItem(CLIENT_KEY + slug) } catch { return null }
}
export function setClientTheme(slug: string, id: string | null) {
  try { if (id) localStorage.setItem(CLIENT_KEY + slug, id); else localStorage.removeItem(CLIENT_KEY + slug) } catch { /* private mode */ }
}
