import { PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SelectNative } from '@/components/ui/select-native'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBeneficiaries } from '@/features/beneficiaries/api'
import { useBeneficiaryLookups } from '@/features/beneficiaries/use-lookups'
import { formatPeso } from '@/lib/format'
import type { BeneficiaryLink } from '../api'

const numOrNull = (v: string) =>
  v.trim() === '' || Number.isNaN(Number(v)) ? null : Math.max(0, Number(v))

/** Pick beneficiaries from the registry and record participants / quantity / amount per beneficiary. */
export function BeneficiaryLinksEditor({
  value,
  onChange,
  units,
  disabled,
}: {
  value: BeneficiaryLink[]
  onChange: (links: BeneficiaryLink[]) => void
  units: { id: string; [key: string]: unknown }[]
  disabled?: boolean
}) {
  const { data: registry = [] } = useBeneficiaries()
  const { names } = useBeneficiaryLookups()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(registry.map((b) => [b.id, b])), [registry])
  const chosen = new Set(value.map((l) => l.beneficiary_id))

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return registry
      .filter((b) => b.status === 'active' && !chosen.has(b.id))
      .filter(
        (b) =>
          !q ||
          b.name.toLowerCase().includes(q) ||
          names.municipality(b.municipality_id).toLowerCase().includes(q) ||
          names.province(b.province_id).toLowerCase().includes(q),
      )
      .slice(0, 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, query, value, names])

  const update = (i: number, patch: Partial<BeneficiaryLink>) =>
    onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const totalParticipants = value.reduce((a, l) => a + (l.participants ?? 0), 0)
  const totalAmount = value.reduce((a, l) => a + (l.amount ?? 0), 0)

  return (
    <div className="space-y-3">
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <PlusIcon /> Add beneficiary
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0">
            <div className="relative border-b">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, municipality or province…"
                className="h-10 border-0 pl-8 shadow-none focus-visible:ring-0"
                aria-label="Search beneficiaries"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
              {matches.length === 0 && (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                  No matches. Add new beneficiaries in the Beneficiaries module.
                </li>
              )}
              {matches.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="hover:bg-accent w-full px-3 py-2 text-left"
                    onClick={() => {
                      onChange([
                        ...value,
                        {
                          beneficiary_id: b.id,
                          participants: b.members_total || null,
                          quantity: null,
                          unit_id: null,
                          amount: null,
                          remarks: null,
                        },
                      ])
                      setQuery('')
                    }}
                  >
                    <span className="block text-sm font-medium">{b.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {names.typeCode(b.type_id)} ·{' '}
                      {[names.municipality(b.municipality_id), names.province(b.province_id)]
                        .filter(Boolean)
                        .join(', ')}{' '}
                      · {b.members_total} members
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}

      {value.length === 0 ? (
        <p className="text-muted-foreground text-sm">No beneficiaries linked yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Beneficiary</TableHead>
                <TableHead className="w-28">Participants</TableHead>
                <TableHead className="w-28">Quantity</TableHead>
                <TableHead className="w-28">Unit</TableHead>
                <TableHead className="w-36">Amount (₱)</TableHead>
                {!disabled && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.map((l, i) => {
                const b = byId.get(l.beneficiary_id)
                return (
                  <TableRow key={l.beneficiary_id}>
                    <TableCell>
                      <p className="text-sm font-medium">{b?.name ?? 'Beneficiary'}</p>
                      {b && (
                        <p className="text-muted-foreground text-xs">
                          {names.municipality(b.municipality_id) || names.province(b.province_id)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        aria-label="Participants"
                        className="h-8"
                        disabled={disabled}
                        value={l.participants ?? ''}
                        onChange={(e) => update(i, { participants: numOrNull(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        aria-label="Quantity"
                        className="h-8"
                        disabled={disabled}
                        value={l.quantity ?? ''}
                        onChange={(e) => update(i, { quantity: numOrNull(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <SelectNative
                        aria-label="Unit"
                        className="[&_select]:h-8"
                        disabled={disabled}
                        value={l.unit_id ?? ''}
                        onChange={(e) => update(i, { unit_id: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {String(u.abbreviation || u.name)}
                          </option>
                        ))}
                      </SelectNative>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label="Amount"
                        className="h-8"
                        disabled={disabled}
                        value={l.amount ?? ''}
                        onChange={(e) => update(i, { amount: numOrNull(e.target.value) })}
                      />
                    </TableCell>
                    {!disabled && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive size-8"
                          aria-label={`Remove ${b?.name ?? 'beneficiary'}`}
                          onClick={() => onChange(value.filter((_, j) => j !== i))}
                        >
                          <Trash2Icon />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="bg-muted/40 text-muted-foreground border-t px-3 py-2 text-xs">
            {value.length} beneficiar{value.length === 1 ? 'y' : 'ies'} ·{' '}
            {totalParticipants.toLocaleString()} participants · {formatPeso(totalAmount)}
          </p>
        </div>
      )}
    </div>
  )
}
