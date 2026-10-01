import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { LocationSelect } from '@/features/locations/LocationSelect'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useDebounced } from '@/hooks/use-debounced'
import { errorMessage } from '@/lib/supabase'
import type { SupplierRow } from '@/types/database'
import { findSimilarSuppliers, useSaveSupplier } from '../api'
import { formatTin, SUPPLIER_STATUSES, SUPPLIER_TYPES, TIN_PATTERN } from '../supplier-logic'

const schema = z
  .object({
    business_name: z.string().trim().min(2, 'Enter the business name').max(200),
    trade_name: z.string().trim().max(200),
    owner_name: z.string().trim().max(150),
    supplier_type: z.enum([
      'individual',
      'partnership',
      'corporation',
      'cooperative',
      'government',
      'other',
    ]),
    tin: z
      .string()
      .trim()
      .refine((v) => v === '' || TIN_PATTERN.test(v), 'Use 123-456-789 or 123-456-789-000'),
    philgeps_no: z.string().trim().max(40),
    philgeps_expiry: z.string(),
    permit_no: z.string().trim().max(60),
    permit_expiry: z.string(),
    province_id: z.string(),
    municipality_id: z.string(),
    barangay_id: z.string(),
    address_line: z.string().trim().max(250),
    contact_person: z.string().trim().max(120),
    contact_no: z.string().trim().max(40),
    email: z.union([z.literal(''), z.email('Enter a valid email')]),
    categories: z.array(z.string()),
    status: z.enum(['active', 'suspended', 'blacklisted']),
    status_reason: z.string().trim().max(1000),
    notes: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'active' && !v.status_reason) {
      ctx.addIssue({ code: 'custom', path: ['status_reason'], message: 'Give the reason' })
    }
  })

type Values = z.infer<typeof schema>

function defaults(s: SupplierRow | null | undefined): Values {
  return {
    business_name: s?.business_name ?? '',
    trade_name: s?.trade_name ?? '',
    owner_name: s?.owner_name ?? '',
    supplier_type: s?.supplier_type ?? 'individual',
    tin: s?.tin ?? '',
    philgeps_no: s?.philgeps_no ?? '',
    philgeps_expiry: s?.philgeps_expiry ?? '',
    permit_no: s?.permit_no ?? '',
    permit_expiry: s?.permit_expiry ?? '',
    province_id: s?.province_id ?? '',
    municipality_id: s?.municipality_id ?? '',
    barangay_id: s?.barangay_id ?? '',
    address_line: s?.address_line ?? '',
    contact_person: s?.contact_person ?? '',
    contact_no: s?.contact_no ?? '',
    email: s?.email ?? '',
    categories: s?.categories ?? [],
    status: s?.status ?? 'active',
    status_reason: s?.status_reason ?? '',
    notes: s?.notes ?? '',
  }
}

/** Mount only while open (fresh defaults per opening). */
export function SupplierFormDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier?: SupplierRow | null
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { isSuperadmin } = useAuth()
  const { categories } = useProcurementLookups()
  const save = useSaveSupplier()
  const editing = !!supplier
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(supplier) })
  const errors = form.formState.errors
  const [name, tin, status, provinceId, municipalityId, barangayId] = useWatch({
    control: form.control,
    name: ['business_name', 'tin', 'status', 'province_id', 'municipality_id', 'barangay_id'],
  })

  const key = useDebounced(`${name}|${tin}`, 500)
  const [dName, dTin] = key.split('|')
  const { data: similar = [] } = useQuery({
    queryKey: ['suppliers', 'similar', key, supplier?.id],
    enabled: dName.trim().length >= 4 || dTin.replace(/\D/g, '').length >= 9,
    queryFn: () => findSimilarSuppliers(dName, dTin || null, supplier?.id),
    staleTime: 60_000,
  })
  const sameTin = similar.find((s) => s.same_tin)

  // Only superadmins blacklist or lift a blacklist.
  const statusLocked = !isSuperadmin && supplier?.status === 'blacklisted'
  const statusOptions = SUPPLIER_STATUSES.filter(
    (s) => isSuperadmin || s.value !== 'blacklisted' || supplier?.status === 'blacklisted',
  )

  const onSubmit = form.handleSubmit(async (v) => {
    if (sameTin) {
      toast.error(`This TIN is already registered to ${sameTin.business_name}.`)
      return
    }
    try {
      const id = await save.mutateAsync({
        id: supplier?.id,
        input: {
          business_name: v.business_name,
          trade_name: v.trade_name || null,
          owner_name: v.owner_name || null,
          supplier_type: v.supplier_type,
          tin: v.tin ? formatTin(v.tin) : null,
          philgeps_no: v.philgeps_no || null,
          philgeps_expiry: v.philgeps_expiry || null,
          permit_no: v.permit_no || null,
          permit_expiry: v.permit_expiry || null,
          province_id: v.province_id || null,
          municipality_id: v.municipality_id || null,
          barangay_id: v.barangay_id || null,
          address_line: v.address_line || null,
          contact_person: v.contact_person || null,
          contact_no: v.contact_no || null,
          email: v.email || null,
          categories: v.categories,
          status: v.status,
          status_reason: v.status === 'active' ? null : v.status_reason,
          notes: v.notes || null,
        },
      })
      toast.success(editing ? 'Supplier updated' : `${v.business_name} added`)
      onClose()
      onSaved?.(id)
    } catch (err) {
      const msg = errorMessage(err)
      toast.error(/tin_key/i.test(msg) ? 'Another supplier already uses this TIN.' : msg)
    }
  })

  const text = (k: keyof Values, label: string, props: React.ComponentProps<'input'> = {}) => (
    <FormField id={`sup-${k}`} label={label} error={errors[k]?.message}>
      <Input id={`sup-${k}`} aria-invalid={!!errors[k]} {...props} {...form.register(k)} />
    </FormField>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${supplier.business_name}` : 'New supplier'}</DialogTitle>
          <DialogDescription>
            Shared by all programs. Check the PhilGEPS and permit dates — expired papers are flagged
            when a package is awarded.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <section className="grid gap-4 sm:grid-cols-2">
            {text('business_name', 'Business name *')}
            {text('trade_name', 'Trade name')}
            {text('owner_name', 'Owner / representative')}
            <FormField id="sup-type" label="Type">
              <SelectNative id="sup-type" {...form.register('supplier_type')}>
                {SUPPLIER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </SelectNative>
            </FormField>
            {text('tin', 'TIN', { placeholder: '123-456-789-000', inputMode: 'numeric' })}

            {similar.length > 0 && (
              <div
                role="status"
                className={
                  sameTin
                    ? 'border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm sm:col-span-2'
                    : 'border-warning/50 bg-warning/10 rounded-md border p-3 text-sm sm:col-span-2'
                }
              >
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangleIcon className="size-4" />
                  {sameTin ? 'This TIN is already registered' : 'Possible duplicates'}
                </p>
                <ul className="space-y-0.5">
                  {similar.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                      <Link
                        to={`/suppliers/${s.id}`}
                        target="_blank"
                        className="text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        {s.business_name} <ExternalLinkIcon className="size-3" />
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {s.same_tin ? 'same TIN' : `${Math.round(s.similarity * 100)}% similar`}
                        {s.tin && ` · ${s.tin}`}
                        {s.status !== 'active' && ` · ${s.status}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">{text('philgeps_no', 'PhilGEPS registration No.')}</div>
            <div className="sm:col-span-2">
              {text('philgeps_expiry', 'PhilGEPS valid until', { type: 'date' })}
            </div>
            <div className="sm:col-span-2">
              {text('permit_no', "Mayor's / business permit No.")}
            </div>
            <div className="sm:col-span-2">
              {text('permit_expiry', 'Permit valid until', { type: 'date' })}
            </div>
          </section>

          <section className="space-y-4">
            <LocationSelect
              idPrefix="sup"
              required={{}}
              value={{
                province_id: provinceId || null,
                municipality_id: municipalityId || null,
                barangay_id: barangayId || null,
              }}
              onChange={(v) => {
                form.setValue('province_id', v.province_id ?? '')
                form.setValue('municipality_id', v.municipality_id ?? '')
                form.setValue('barangay_id', v.barangay_id ?? '')
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {text('address_line', 'Street / address')}
              {text('contact_person', 'Contact person')}
              {text('contact_no', 'Contact No.')}
              {text('email', 'Email', { type: 'email' })}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Supplies these categories</p>
            <Controller
              control={form.control}
              name="categories"
              render={({ field }) => (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {categories
                    .filter((c) => c.is_active || field.value.includes(c.code))
                    .map((c) => (
                      <label key={c.code} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(c.code)}
                          onCheckedChange={(on) =>
                            field.onChange(
                              on
                                ? [...field.value, c.code]
                                : field.value.filter((x) => x !== c.code),
                            )
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                </div>
              )}
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <FormField id="sup-status" label="Status">
              <SelectNative id="sup-status" disabled={statusLocked} {...form.register('status')}>
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectNative>
            </FormField>
            {status !== 'active' && (
              <div className="sm:col-span-2">
                <FormField
                  id="sup-status_reason"
                  label="Reason *"
                  error={errors.status_reason?.message}
                >
                  <Input
                    id="sup-status_reason"
                    disabled={statusLocked}
                    aria-invalid={!!errors.status_reason}
                    placeholder="e.g. BAC Resolution No. 2026-03"
                    {...form.register('status_reason')}
                  />
                </FormField>
              </div>
            )}
          </section>

          <FormField id="sup-notes" label="Notes">
            <Textarea id="sup-notes" rows={2} {...form.register('notes')} />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || !!sameTin}>
              {save.isPending && <Loader2Icon className="animate-spin" />}
              {editing ? 'Save changes' : 'Add supplier'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
