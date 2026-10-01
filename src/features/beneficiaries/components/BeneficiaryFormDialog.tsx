import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
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
import { canWriteProgram } from '@/features/auth/permissions'
import { LocationSelect } from '@/features/locations/LocationSelect'
import { useDebounced } from '@/hooks/use-debounced'
import { errorMessage } from '@/lib/supabase'
import { findSimilarBeneficiaries, useSaveBeneficiary, type Beneficiary } from '../api'
import { useBeneficiaryLookups } from '../use-lookups'
import { CommodityPicker } from './CommodityPicker'

const FOD = '__fod__'
const count = z.coerce.number<number>().int('Whole numbers only').min(0, 'Cannot be negative')
const optionalNumber = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max), {
      message: `${label} must be between ${min} and ${max}`,
    })

const schema = z
  .object({
    program: z.string().min(1, 'Select the registering program'),
    type_id: z.string().min(1, 'Select a type'),
    name: z.string().trim().min(2, 'Enter the name').max(200),
    registration_no: z.string().trim().max(60),
    registration_agency: z.string().trim().max(60),
    province_id: z.string().min(1, 'Select a province'),
    municipality_id: z.string(),
    barangay_id: z.string(),
    address_line: z.string().trim().max(200),
    contact_person: z.string().trim().max(120),
    contact_no: z.string().trim().max(40),
    email: z.union([z.literal(''), z.email('Enter a valid email')]),
    members_male: count,
    members_female: count,
    members_ip: count,
    members_youth: count,
    members_pwd: count,
    members_senior: count,
    area_ha: optionalNumber(0, 1_000_000, 'Area'),
    status: z.enum(['active', 'inactive', 'dissolved']),
    latitude: optionalNumber(-90, 90, 'Latitude'),
    longitude: optionalNumber(-180, 180, 'Longitude'),
    remarks: z.string().trim().max(2000),
    commodity_ids: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const total = v.members_male + v.members_female
    for (const key of ['members_ip', 'members_youth', 'members_pwd', 'members_senior'] as const) {
      if (v[key] > total)
        ctx.addIssue({ code: 'custom', path: [key], message: `Cannot exceed total (${total})` })
    }
    if ((v.latitude === '') !== (v.longitude === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['longitude'],
        message: 'Give both coordinates, or neither',
      })
    }
  })

type Values = z.infer<typeof schema>

function defaults(b: Beneficiary | null | undefined, program: string): Values {
  return {
    program: b ? (b.registered_by_program_id ?? FOD) : program,
    type_id: b?.type_id ?? '',
    name: b?.name ?? '',
    registration_no: b?.registration_no ?? '',
    registration_agency: b?.registration_agency ?? '',
    province_id: b?.province_id ?? '',
    municipality_id: b?.municipality_id ?? '',
    barangay_id: b?.barangay_id ?? '',
    address_line: b?.address_line ?? '',
    contact_person: b?.contact_person ?? '',
    contact_no: b?.contact_no ?? '',
    email: b?.email ?? '',
    members_male: b?.members_male ?? 0,
    members_female: b?.members_female ?? 0,
    members_ip: b?.members_ip ?? 0,
    members_youth: b?.members_youth ?? 0,
    members_pwd: b?.members_pwd ?? 0,
    members_senior: b?.members_senior ?? 0,
    area_ha: b?.area_ha?.toString() ?? '',
    status: b?.status ?? 'active',
    latitude: b?.latitude?.toString() ?? '',
    longitude: b?.longitude?.toString() ?? '',
    remarks: b?.remarks ?? '',
    commodity_ids: b?.commodity_ids ?? [],
  }
}

export function BeneficiaryFormDialog({
  open,
  onOpenChange,
  beneficiary,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  beneficiary?: Beneficiary | null
  onSaved?: (id: string) => void
}) {
  // Mount the body per opening so the form starts from fresh defaults.
  return open ? (
    <BeneficiaryForm
      key={beneficiary?.id ?? 'new'}
      onOpenChange={onOpenChange}
      beneficiary={beneficiary}
      onSaved={onSaved}
    />
  ) : null
}

function BeneficiaryForm({
  onOpenChange,
  beneficiary,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void
  beneficiary?: Beneficiary | null
  onSaved?: (id: string) => void
}) {
  const { profile, programs, isSuperadmin } = useAuth()
  const { lookups, commodityOptions } = useBeneficiaryLookups()
  const save = useSaveBeneficiary()
  const editing = !!beneficiary

  const programIds = programs.map((p) => p.id)
  const writable = useMemo(
    () => programs.filter((p) => !p.archived_at && canWriteProgram(profile, programIds, p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programs, profile],
  )
  const defaultProgram =
    profile?.program_id && writable.some((p) => p.id === profile.program_id)
      ? profile.program_id
      : (writable[0]?.id ?? (isSuperadmin ? FOD : ''))

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(beneficiary, defaultProgram),
  })
  const errors = form.formState.errors
  const [name, provinceId, municipalityId, barangayId, male, female] = useWatch({
    control: form.control,
    name: [
      'name',
      'province_id',
      'municipality_id',
      'barangay_id',
      'members_male',
      'members_female',
    ],
  })

  // Live duplicate check against the whole registry.
  const debouncedName = useDebounced(name, 500)
  const { data: similar = [] } = useQuery({
    queryKey: ['beneficiaries', 'similar', debouncedName, municipalityId, beneficiary?.id],
    enabled: debouncedName.trim().length >= 4,
    queryFn: () => findSimilarBeneficiaries(debouncedName, municipalityId || null, beneficiary?.id),
    staleTime: 60_000,
  })

  const onSubmit = form.handleSubmit(async (v) => {
    const num = (s: string) => (s === '' ? null : Number(s))
    try {
      const id = await save.mutateAsync({
        id: beneficiary?.id,
        previousCommodityIds: beneficiary?.commodity_ids,
        commodityIds: v.commodity_ids,
        input: {
          registered_by_program_id: v.program === FOD ? null : v.program,
          type_id: v.type_id,
          name: v.name,
          registration_no: v.registration_no || null,
          registration_agency: v.registration_agency || null,
          province_id: v.province_id,
          municipality_id: v.municipality_id || null,
          barangay_id: v.barangay_id || null,
          address_line: v.address_line || null,
          contact_person: v.contact_person || null,
          contact_no: v.contact_no || null,
          email: v.email || null,
          members_male: v.members_male,
          members_female: v.members_female,
          members_ip: v.members_ip,
          members_youth: v.members_youth,
          members_pwd: v.members_pwd,
          members_senior: v.members_senior,
          area_ha: num(v.area_ha),
          status: v.status,
          latitude: num(v.latitude),
          longitude: num(v.longitude),
          remarks: v.remarks || null,
        },
      })
      toast.success(editing ? 'Beneficiary updated' : `${v.name} added`)
      onOpenChange(false)
      onSaved?.(id)
    } catch (err) {
      const msg = errorMessage(err)
      toast.error(
        /already exists/i.test(msg)
          ? 'Another active record already uses this registration number.'
          : msg,
      )
    }
  })

  const total = (Number(male) || 0) + (Number(female) || 0)
  const num = (key: keyof Values, label: string) => (
    <FormField id={key} label={label} error={errors[key]?.message}>
      <Input
        id={key}
        type="number"
        min={0}
        inputMode="numeric"
        aria-invalid={!!errors[key]}
        {...form.register(key)}
      />
    </FormField>
  )

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${beneficiary.name}` : 'New beneficiary'}</DialogTitle>
          <DialogDescription>
            Farmers' associations, cooperatives, IP organizations, LGUs and individual farmers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <section className="grid gap-4 sm:grid-cols-2">
            <FormField id="name" label="Name *" error={errors.name?.message}>
              <Input id="name" aria-invalid={!!errors.name} {...form.register('name')} />
            </FormField>
            <FormField id="type_id" label="Type *" error={errors.type_id?.message}>
              <SelectNative
                id="type_id"
                aria-invalid={!!errors.type_id}
                {...form.register('type_id')}
              >
                <option value="">Select type…</option>
                {lookups.types
                  .filter((t) => t.is_active || t.id === beneficiary?.type_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name}
                    </option>
                  ))}
              </SelectNative>
            </FormField>

            {similar.length > 0 && (
              <div
                role="status"
                className="border-warning/50 bg-warning/10 rounded-md border p-3 text-sm sm:col-span-2"
              >
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangleIcon className="size-4 text-[oklch(0.6_0.14_70)]" /> Possible
                  duplicates
                </p>
                <ul className="space-y-0.5">
                  {similar.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                      <Link
                        to={`/beneficiaries/${s.id}`}
                        target="_blank"
                        className="text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        {s.name} <ExternalLinkIcon className="size-3" />
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {Math.round(s.similarity * 100)}% similar
                        {s.same_municipality && ' · same municipality'}
                        {s.registration_no && ` · ${s.registration_no}`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-1 text-xs">
                  If one of these is the same organization, update it instead of adding a new
                  record.
                </p>
              </div>
            )}

            {!editing && (
              <FormField id="program" label="Registered by *" error={errors.program?.message}>
                <SelectNative id="program" {...form.register('program')}>
                  {writable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                  {isSuperadmin && <option value={FOD}>FOD (no specific program)</option>}
                </SelectNative>
              </FormField>
            )}
            <FormField id="status" label="Status">
              <SelectNative id="status" {...form.register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="dissolved">Dissolved</option>
              </SelectNative>
            </FormField>
            <FormField id="registration_no" label="Registration no.">
              <Input
                id="registration_no"
                placeholder="e.g. CDA-9520-2015-0031"
                {...form.register('registration_no')}
              />
            </FormField>
            <FormField id="registration_agency" label="Registering agency">
              <Input
                id="registration_agency"
                list="reg-agencies"
                placeholder="DOLE, CDA, SEC, NCIP…"
                {...form.register('registration_agency')}
              />
              <datalist id="reg-agencies">
                {['DOLE', 'CDA', 'SEC', 'NCIP', 'DSWD', 'LGU'].map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </FormField>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Location</h3>
            <LocationSelect
              idPrefix="ben"
              value={{
                province_id: provinceId || null,
                municipality_id: municipalityId || null,
                barangay_id: barangayId || null,
              }}
              errors={{ province: errors.province_id?.message }}
              onChange={(loc) => {
                form.setValue('province_id', loc.province_id ?? '', {
                  shouldValidate: form.formState.isSubmitted,
                })
                form.setValue('municipality_id', loc.municipality_id ?? '')
                form.setValue('barangay_id', loc.barangay_id ?? '')
              }}
            />
            <FormField id="address_line" label="Sitio / purok / street">
              <Input id="address_line" {...form.register('address_line')} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="latitude"
                label="Latitude"
                error={errors.latitude?.message}
                hint="Optional, e.g. 16.7220"
              >
                <Input id="latitude" inputMode="decimal" {...form.register('latitude')} />
              </FormField>
              <FormField
                id="longitude"
                label="Longitude"
                error={errors.longitude?.message}
                hint="Optional, e.g. 120.8330"
              >
                <Input id="longitude" inputMode="decimal" {...form.register('longitude')} />
              </FormField>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Contact</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="contact_person" label="Contact person">
                <Input id="contact_person" {...form.register('contact_person')} />
              </FormField>
              <FormField id="contact_no" label="Contact no.">
                <Input id="contact_no" inputMode="tel" {...form.register('contact_no')} />
              </FormField>
              <FormField id="email" label="Email" error={errors.email?.message}>
                <Input id="email" type="email" {...form.register('email')} />
              </FormField>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">
              Members{' '}
              <span className="text-muted-foreground font-normal">
                · total {total.toLocaleString()}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {num('members_male', 'Male')}
              {num('members_female', 'Female')}
              {num('members_ip', 'IP')}
              {num('members_youth', 'Youth')}
              {num('members_pwd', 'PWD')}
              {num('members_senior', 'Senior')}
            </div>
            <p className="text-muted-foreground text-xs">
              IP, youth, PWD and senior counts are subsets of the total (male + female).
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <FormField id="commodities" label="Commodities">
              <Controller
                control={form.control}
                name="commodity_ids"
                render={({ field }) => (
                  <CommodityPicker
                    options={commodityOptions}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </FormField>
            <FormField id="area_ha" label="Area (ha)" error={errors.area_ha?.message}>
              <Input id="area_ha" inputMode="decimal" {...form.register('area_ha')} />
            </FormField>
          </section>

          <FormField id="remarks" label="Remarks">
            <Textarea id="remarks" rows={2} {...form.register('remarks')} />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              {editing ? 'Save changes' : 'Add beneficiary'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
