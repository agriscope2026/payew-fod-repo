/** Largest centred square inside a w × h image: the source rectangle to crop. */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height)
  return {
    sx: Math.round((width - side) / 2),
    sy: Math.round((height - side) / 2),
    side,
  }
}

/** "My Photo.WEBP" → "My Photo.jpg" */
export function jpegName(fileName: string) {
  const base = fileName.replace(/\.[^./\\]+$/, '') || 'photo'
  return `${base}.jpg`
}

/**
 * Turns any image the browser can decode (JPEG, PNG, WebP, GIF, BMP…) into a
 * small square JPEG: centre-cropped, scaled down to `size` px and re-encoded.
 * Phone photos of several MB come out at roughly 30–80 KB. EXIF rotation is
 * applied while decoding, and transparent areas become white.
 */
export async function compressSquareJpeg(
  file: File,
  { size = 512, quality = 0.85 }: { size?: number; quality?: number } = {},
): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('This image could not be read. Try a JPG, PNG or WebP file.')
  }
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height)
    const out = Math.min(size, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser cannot process images.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out, out)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('The photo could not be compressed.')
    return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}
