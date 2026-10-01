import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/supabase'
import type { MasterRow } from './api'
import { MASTER_LIST_BY_KEY, type FieldDef, type MasterListDef } from './config'

function fieldSchema(f: FieldDef) {
  switch (f.type) {
    case 'boolean':
      return z.boolean()
    case 'number':
      return z.coerce.number<number>().int('Whole numbers only')
    default: {
      const base = z
        .string()
        .trim()
        .max(f.type === 'textarea' ? 1000 : 200)
      return f.required ? base.min(1, `${f.label} is required`) : base
    }
  }
}

function emptyValue(f: FieldDef) {
  return f.type === 'boolean' ? false : f.type === 'number' ? 0 : ''
}

export function MasterRowDialog({
  def,
  open,
  row,
  defaults,
  optionLists,
  onOpenChange,
  onSave,
}: {
  def: MasterListDef
  open: boolean
  row: MasterRow | null
  defaults: Record<string, unknown>
  optionLists: Partial<Record<MasterListDef['key'], MasterRow[]>>
  onOpenChange: (open: boolean) => void
  onSave: (values: Record<string, unknown>) => Promise<unknown>
}) {
  const schema = useMemo(
    () => z.object(Object.fromEntries(def.fields.map((f) => [f.key, fieldSchema(f)]))),
    [def],
  )
  const initial = () =>
    Object.fromEntries(
      def.fields.map((f) => [f.key, row?.[f.key] ?? defaults[f.key] ?? emptyValue(f)]),
    ) as Record<string, unknown>

  type Values = Record<string, string | number | boolean>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: initial() as Values,
  })

  useEffect(() => {
    if (open) form.reset(initial() as Values)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id])

  const onSubmit = form.handleSubmit(async (values) => {
    // Empty optional text → null; uppercase codes.
    const payload = Object.fromEntries(
      def.fields.map((f) => {
        let v: unknown = values[f.key]
        if (typeof v === 'string') {
          v = f.uppercase ? v.toUpperCase() : v
          if (v === '' && !f.required) v = null
        }
        return [f.key, v]
      }),
    )
    try {
      await onSave(payload)
      toast.success(
        row ? 'Saved' : `${def.singular[0].toUpperCase()}${def.singular.slice(1)} added`,
      )
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row ? 'Edit' : 'Add'} {def.singular}
          </DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {def.fields.map((f) => {
            const error = errors[f.key]?.message as string | undefined
            if (f.type === 'boolean') {
              return (
                <Controller
                  key={f.key}
                  control={form.control}
                  name={f.key}
                  render={({ field }) => (
                    <label className="flex items-center gap-3 text-sm">
                      <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                      {f.label}
                    </label>
                  )}
                />
              )
            }
            if (f.type === 'select' && f.optionsFrom) {
              const source = MASTER_LIST_BY_KEY[f.optionsFrom]
              const options = optionLists[f.optionsFrom] ?? []
              return (
                <FormField key={f.key} id={f.key} label={f.label} error={error}>
                  <SelectNative id={f.key} aria-invalid={!!error} {...form.register(f.key)}>
                    <option value="">Select…</option>
                    {options.map((o) => (
                      <option
                        key={o.id}
                        value={o.id}
                        disabled={!o.is_active && o.id !== row?.[f.key]}
                      >
                        {String(o[source.labelKey])}
                        {source.key === 'expense_classes' ? ` · ${String(o.name)}` : ''}
                        {!o.is_active ? ' (inactive)' : ''}
                      </option>
                    ))}
                  </SelectNative>
                </FormField>
              )
            }
            return (
              <FormField key={f.key} id={f.key} label={f.label} error={error}>
                {f.type === 'textarea' ? (
                  <Textarea
                    id={f.key}
                    rows={3}
                    placeholder={f.placeholder}
                    {...form.register(f.key)}
                  />
                ) : (
                  <Input
                    id={f.key}
                    type={f.type === 'number' ? 'number' : 'text'}
                    placeholder={f.placeholder}
                    className={f.uppercase ? 'uppercase' : undefined}
                    aria-invalid={!!error}
                    {...form.register(f.key)}
                  />
                )}
              </FormField>
            )
          })}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
