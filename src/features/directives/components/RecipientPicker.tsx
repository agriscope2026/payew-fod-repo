import { SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { RoleBadge } from '@/components/common/Badges'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { AppRole } from '@/types/database'

export interface Recipient {
  id: string
  full_name: string
  position: string | null
  role: AppRole
}

/** Searchable checklist of people. */
export function RecipientPicker({
  people,
  value,
  onChange,
}: {
  people: Recipient[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const [q, setQ] = useState('')
  const shown = people.filter((p) =>
    `${p.full_name} ${p.position ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const selected = new Set(value)
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((v) => v !== id))

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 border-b px-2">
        <SearchIcon className="text-muted-foreground size-4" />
        <Input
          aria-label="Search people"
          placeholder="Search people…"
          className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-muted-foreground shrink-0 text-xs">{value.length} selected</span>
      </div>
      <ul className="max-h-48 overflow-y-auto p-1">
        {shown.length === 0 && (
          <li className="text-muted-foreground px-2 py-3 text-center text-sm">
            No matching people
          </li>
        )}
        {shown.map((p) => (
          <li key={p.id}>
            <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
              <Checkbox checked={selected.has(p.id)} onCheckedChange={(c) => toggle(p.id, !!c)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.full_name}</span>
                {p.position && (
                  <span className="text-muted-foreground block truncate text-xs">{p.position}</span>
                )}
              </span>
              {p.role !== 'program_staff' && <RoleBadge role={p.role} />}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
