// QR codes for links: the pattern itself, and saving one as a picture.
import qrcode from 'qrcode-generator'

/** The dark squares of the QR code for a piece of text, row by row. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

export const QUIET = 4

/** Saves the QR code as a PNG with the name printed under it. */
export function downloadQr(value: string, title: string) {
  const m = qrMatrix(value)
  const scale = 16
  const side = (m.length + QUIET * 2) * scale
  const caption = 64
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side + caption
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale)
    }),
  )
  ctx.font = '600 26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let label = title
  while (label.length > 4 && ctx.measureText(label).width > side - 48) label = label.slice(0, -2)
  if (label !== title) label = `${label.trimEnd()}…`
  ctx.fillText(label, side / 2, side + caption / 2 - 8)
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'qr-code'} QR.png`
  a.click()
}
