import qrcode from '../vendor/qrcode-generator'

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']

/** Dark modules of a QR code for `text` as one SVG path, plus the module count. */
export function qrPath(text: string): { size: number; d: string } {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  const size = q.getModuleCount()
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`
  }
  return { size, d }
}
