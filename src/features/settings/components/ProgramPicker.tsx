import { SelectNative } from '@/components/ui/select-native'
import type { ProgramRow } from '@/types/database'

/** Shown only when a program admin manages more than one program. */
export function ProgramPicker({
  programs,
  value,
  onChange,
}: {
  programs: ProgramRow[]
  value: string
  onChange: (id: string) => void
}) {
  if (programs.length < 2) return null
  return (
    <SelectNative
      aria-label="Program"
      className="w-56"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {programs.map((p) => (
        <option key={p.id} value={p.id}>
          {p.code} · {p.name}
        </option>
      ))}
    </SelectNative>
  )
}
