import Icon from './Icon'
import { mediaUrl } from '../lib/brand'

/** A product photo, or a soft placeholder with the bag icon. */
export default function ProductPhoto({ path, name, className = 'product-photo' }: { path: string | null; name: string; className?: string }) {
  const url = mediaUrl(path)
  return url ? <img className={className} src={url} alt={name} loading="lazy" /> : <span className={`${className} empty`} aria-hidden="true"><Icon name="bag" size={28} /></span>
}
