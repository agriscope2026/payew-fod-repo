import { SearchIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

export interface CommodityOption {
  id: string
  name: string
  category: string
  is_active: boolean
}

/** Multi-select of commodities grouped by category, with search and removable chips. */
export function CommodityPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: CommodityOption[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, CommodityOption[]>()
    for (const o of options) {
      if (!o.is_active && !value.includes(o.id)) continue
      if (q && !o.name.toLowerCase().includes(q) && !o.category.toLowerCase().includes(q)) continue
      map.set(o.category, [...(map.get(o.category) ?? []), o])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [options, query, value])

  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((v) => v !== id))

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
            >
              {byId.get(id)?.name ?? 'Unknown'}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(id, false)}
                  aria-label={`Remove ${byId.get(id)?.name}`}
                  className="hover:text-destructive rounded"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="rounded-md border">
        <div className="relative border-b">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a commodity…"
            className="h-8 border-0 pl-8 shadow-none focus-visible:ring-0"
            aria-label="Find a commodity"
            disabled={disabled}
          />
        </div>
        <div className="max-h-44 space-y-2 overflow-y-auto p-2">
          {groups.length === 0 && <p className="text-muted-foreground px-1 text-sm">No matches.</p>}
          {groups.map(([category, items]) => (
            <fieldset key={category}>
              <legend className="text-muted-foreground mb-1 px-1 text-[11px] font-semibold tracking-wide uppercase">
                {category}
              </legend>
              <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                {items.map((o) => (
                  <label
                    key={o.id}
                    className="hover:bg-accent/50 flex items-center gap-2 rounded px-1 py-0.5 text-sm"
                  >
                    <Checkbox
                      checked={value.includes(o.id)}
                      onCheckedChange={(c) => toggle(o.id, !!c)}
                      disabled={disabled}
                    />
                    {o.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  )
}
