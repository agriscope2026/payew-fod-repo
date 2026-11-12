import { useMemo } from 'react'
import { QUIET, qrMatrix } from './qr'

/** Always black on white, whatever the theme, so phones can read it. */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const path = useMemo(() => {
    const m = qrMatrix(value)
    let d = ''
    m.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (dark) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`
      }),
    )
    return { d, size: m.length + QUIET * 2 }
  }, [value])
  return (
    <svg
      viewBox={`0 0 ${path.size} ${path.size}`}
      className={className}
      role="img"
      aria-label="QR code"
      shapeRendering="crispEdges"
    >
      <rect width={path.size} height={path.size} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  )
}
