import { extensionOf } from '@shared/files-core'

/** "Benguet, coffee ,benguet" → ["benguet", "coffee"] (max 20). */
export function parseTags(input: string) {
  return [
    ...new Set(
      input
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20)
}

/** Files the browser can show inline (PDF viewer, <img>). */
export function isPreviewable(fileName: string) {
  return ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(extensionOf(fileName))
}
