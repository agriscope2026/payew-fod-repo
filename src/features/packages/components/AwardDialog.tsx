import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlusIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SelectNative } from '@/components/ui/select-native'
import { Textarea } from '@/components/ui/textarea'
import { supplierAwardCheck, useCanManageSuppliers, useSuppliers } from '@/features/suppliers/api'
import { SupplierFormDialog } from '@/features/suppliers/components/SupplierFormDialog'
import { formatPeso, todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { PackageView } from '@/types/database'
import { useAwardPackage } from '../api'
import { useProcurementLookups } from '../use-procurement-lookups'

export type AwardMode = 'award' | 'reaward' | 'amend'

const COPY: Record<AwardMode, { title: string; description: string; button: string }> = {
  award: {
    title: 'Award package',
    description: 'Record the winning supplier, the contract/PO amount and the award date.',
    button: 'Award',
  },
  reaward: {
    title: 'Re-award to another supplier',
    description:
      'Use after a failed bidding or non-delivery. The previous award stays in the package history.',
    button: 'Re-award',
  },
  amend: {
    title: 'Change contract amount',
    description: 'Contract amount variations need a program admin and a reason (recorded).',
    button: 'Save change',
  },
}

/** Award / re-award / amend a package. Shows supplier warnings; blacklisted suppliers are blocked. */
export function AwardDialog({
  pkg,
  mode,
  onClose,
}: {
  pkg: PackageView
  mode: AwardMode
  onClose: () => void
}) {
  const lookups = useProcurementLookups()
  const { data: suppliers = [] } = useSuppliers()
  const canAddSupplier = useCanManageSuppliers()
  const award = useAwardPackage()
  const [supplierId, setSupplierId] = useState(mode === 'amend' ? (pkg.supplier_id ?? '') : '')
  const [amount, setAmount] = useState(
    pkg.contract_amount !== null && mode !== 'reaward' ? String(pkg.contract_amount) : '',
  )
  const [awardDate, setAwardDate] = useState(
    mode === 'amend' ? (pkg.award_date ?? todayManila()) : todayManila(),
  )
  const [contractNo, setContractNo] = useState(mode === 'amend' ? (pkg.contract_no ?? '') : '')
  const [modeId, setModeId] = useState(pkg.procurement_mode_id ?? '')
  const [reason, setReason] = useState('')
  const [picking, setPicking] = useState(false)
  const [adding, setAdding] = useState(false)
  const copy = COPY[mode]

  const { data: checks = [], isFetching: checking } = useQuery({
    queryKey: ['suppliers', 'award-check', supplierId, awardDate],
    enabled: !!supplierId,
    queryFn: () => supplierAwardCheck(supplierId, awardDate || undefined),
  })
  const blocked = checks.some((c) => c.level === 'block')
  const supplier = suppliers.find((s) => s.id === supplierId)
  const amountNum = Number(amount.replace(/,/g, ''))
  const amountValid = amount.trim() !== '' && Number.isFinite(amountNum) && amountNum >= 0
  const needsReason = mode !== 'award'
  const valid =
    !!supplierId && amountValid && !blocked && (!needsReason || reason.trim().length > 0)

  // Suppliers of this category first, then the rest; blacklisted ones are shown but disabled.
  const catCode = pkg.category_code
  const ordered = [...suppliers]
    .filter((s) => mode !== 'reaward' || s.id !== pkg.supplier_id)
    .sort(
      (a, b) =>
        Number(!(catCode && b.categories.includes(catCode))) -
          Number(!(catCode && a.categories.includes(catCode))) ||
        a.business_name.localeCompare(b.business_name),
    )

  const submit = async () => {
    try {
      const warnings = await award.mutateAsync({
        packageId: pkg.id,
        supplierId,
        contractAmount: amountNum,
        awardDate: awardDate || null,
        contractNo: contractNo.trim() || null,
        procurementModeId: modeId || null,
        reason: reason.trim() || null,
        reaward: mode === 'reaward',
      })
      toast.success(
        `${pkg.code} ${mode === 'amend' ? 'updated' : `awarded to ${supplier?.business_name}`}`,
      )
      for (const w of warnings.filter((x) => x.level === 'warn')) toast.warning(w.message)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {pkg.code} · {pkg.title}. {copy.description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {mode !== 'amend' && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Supplier *</span>
              <Popover open={picking} onOpenChange={setPicking}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={picking}
                    className="justify-between"
                  >
                    <span className="truncate">
                      {supplier?.business_name ?? 'Choose a supplier…'}
                    </span>
                    <ChevronsUpDownIcon className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] min-w-80 p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search suppliers…" />
                    <CommandList>
                      <CommandEmpty>No supplier found.</CommandEmpty>
                      <CommandGroup>
                        {ordered.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={`${s.business_name} ${s.tin ?? ''} ${s.trade_name ?? ''}`}
                            disabled={s.status === 'blacklisted'}
                            onSelect={() => {
                              setSupplierId(s.id)
                              setPicking(false)
                            }}
                          >
                            <CheckIcon
                              className={cn(s.id === supplierId ? 'opacity-100' : 'opacity-0')}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{s.business_name}</span>
                              <span className="text-muted-foreground block truncate text-xs">
                                {s.categories
                                  .map((c) => lookups.categoryByCode(c)?.name ?? c)
                                  .join(', ') || 'No categories'}
                              </span>
                            </span>
                            {s.status !== 'active' && (
                              <span
                                className={cn(
                                  'text-xs',
                                  s.status === 'blacklisted'
                                    ? 'text-destructive'
                                    : 'text-[oklch(0.5_0.13_70)]',
                                )}
                              >
                                {s.status === 'blacklisted' ? (
                                  <BanIcon className="inline size-3" />
                                ) : (
                                  <AlertTriangleIcon className="inline size-3" />
                                )}{' '}
                                {s.status}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {canAddSupplier && (
                    <div className="border-t p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          setPicking(false)
                          setAdding(true)
                        }}
                      >
                        <PlusIcon /> New supplier
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}

          {supplierId && (checking || checks.length > 0) && (
            <ul className="space-y-1 text-sm" aria-live="polite">
              {checking && (
                <li className="text-muted-foreground flex items-center gap-2">
                  <Loader2Icon className="size-4 animate-spin" /> Checking supplier records…
                </li>
              )}
              {checks.map((c) => (
                <li
                  key={c.message}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-2.5 py-1.5',
                    c.level === 'block'
                      ? 'border-destructive/40 bg-destructive/5 text-destructive'
                      : 'border-warning/50 bg-warning/10',
                  )}
                >
                  {c.level === 'block' ? (
                    <BanIcon className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>
                    <strong>{c.level === 'block' ? 'Cannot award: ' : 'Warning: '}</strong>
                    {c.message}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="aw-amount"
              label="Contract / PO amount *"
              hint={`ABC ${formatPeso(pkg.abc_amount)}${
                amountValid && amountNum <= pkg.abc_amount
                  ? ` · savings ${formatPeso(pkg.abc_amount - amountNum)}`
                  : ''
              }`}
              error={
                amountValid && amountNum > pkg.abc_amount
                  ? 'Above the ABC (allowed, but flagged)'
                  : undefined
              }
            >
              <Input
                id="aw-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </FormField>
            <FormField id="aw-date" label="Award date">
              <Input
                id="aw-date"
                type="date"
                max={todayManila()}
                value={awardDate}
                onChange={(e) => setAwardDate(e.target.value)}
              />
            </FormField>
            {mode !== 'amend' && (
              <>
                <FormField id="aw-po" label="PO / contract No.">
                  <Input
                    id="aw-po"
                    value={contractNo}
                    onChange={(e) => setContractNo(e.target.value)}
                  />
                </FormField>
                {mode === 'award' && (
                  <FormField id="aw-mode" label="Procurement mode">
                    <SelectNative
                      id="aw-mode"
                      value={modeId}
                      onChange={(e) => setModeId(e.target.value)}
                    >
                      <option value="">—</option>
                      {lookups.modes.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </SelectNative>
                  </FormField>
                )}
              </>
            )}
          </div>
          {needsReason && (
            <FormField id="aw-reason" label="Reason *">
              <Textarea
                id="aw-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  mode === 'reaward'
                    ? 'e.g. First supplier failed to deliver within the contract period'
                    : 'e.g. Additional 10 pax approved per memo'
                }
              />
            </FormField>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || award.isPending} onClick={() => void submit()}>
            {award.isPending && <Loader2Icon className="animate-spin" />} {copy.button}
          </Button>
        </div>

        {adding && <SupplierFormDialog onClose={() => setAdding(false)} onSaved={setSupplierId} />}
      </DialogContent>
    </Dialog>
  )
}
