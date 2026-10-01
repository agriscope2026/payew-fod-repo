import { FormField } from '@/components/common/FormField'
import { SelectNative } from '@/components/ui/select-native'
import { cn } from '@/lib/utils'
import { useLocations, type LocationIds } from './api'

/**
 * Cascading Province → Municipality/City → Barangay selects, reused by every module.
 * Changing a parent clears its children. Inactive entries are hidden unless already selected.
 */
export function LocationSelect({
  value,
  onChange,
  errors = {},
  required = { province: true },
  disabled,
  idPrefix = 'loc',
  className,
}: {
  value: LocationIds
  onChange: (next: LocationIds) => void
  errors?: Partial<Record<'province' | 'municipality' | 'barangay', string>>
  required?: Partial<Record<'province' | 'municipality' | 'barangay', boolean>>
  disabled?: boolean
  idPrefix?: string
  className?: string
}) {
  const { data, isPending } = useLocations()
  const visible = <T extends { id: string; is_active: boolean }>(
    rows: T[],
    selected: string | null,
  ) => rows.filter((r) => r.is_active || r.id === selected)

  const provinces = visible(data?.provinces ?? [], value.province_id)
  const municipalities = visible(
    (data?.municipalities ?? []).filter((m) => m.province_id === value.province_id),
    value.municipality_id,
  )
  const barangays = visible(
    (data?.barangays ?? []).filter((b) => b.municipality_id === value.municipality_id),
    value.barangay_id,
  )
  const label = (text: string, req?: boolean) => (req ? `${text} *` : text)

  return (
    <div className={cn('grid gap-4 sm:grid-cols-3', className)}>
      <FormField
        id={`${idPrefix}-province`}
        label={label('Province', required.province)}
        error={errors.province}
      >
        <SelectNative
          id={`${idPrefix}-province`}
          value={value.province_id ?? ''}
          disabled={disabled || isPending}
          aria-invalid={!!errors.province}
          onChange={(e) =>
            onChange({
              province_id: e.target.value || null,
              municipality_id: null,
              barangay_id: null,
            })
          }
        >
          <option value="">{isPending ? 'Loading…' : 'Select province…'}</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectNative>
      </FormField>
      <FormField
        id={`${idPrefix}-municipality`}
        label={label('Municipality / City', required.municipality)}
        error={errors.municipality}
      >
        <SelectNative
          id={`${idPrefix}-municipality`}
          value={value.municipality_id ?? ''}
          disabled={disabled || !value.province_id}
          aria-invalid={!!errors.municipality}
          onChange={(e) =>
            onChange({ ...value, municipality_id: e.target.value || null, barangay_id: null })
          }
        >
          <option value="">
            {value.province_id ? 'Select municipality…' : 'Select a province first'}
          </option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectNative>
      </FormField>
      <FormField
        id={`${idPrefix}-barangay`}
        label={label('Barangay', required.barangay)}
        error={errors.barangay}
      >
        <SelectNative
          id={`${idPrefix}-barangay`}
          value={value.barangay_id ?? ''}
          disabled={disabled || !value.municipality_id}
          aria-invalid={!!errors.barangay}
          onChange={(e) => onChange({ ...value, barangay_id: e.target.value || null })}
        >
          <option value="">
            {!value.municipality_id
              ? 'Select a municipality first'
              : barangays.length
                ? 'Select barangay…'
                : 'No barangays listed yet'}
          </option>
          {barangays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectNative>
      </FormField>
    </div>
  )
}
