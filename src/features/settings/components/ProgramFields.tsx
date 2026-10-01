import type { UseFormReturn } from 'react-hook-form'
import { FormField } from '@/components/common/FormField'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ProgramValues } from '../program-schema'

const PRESETS = [
  '#0f766e',
  '#7c3aed',
  '#ea580c',
  '#16a34a',
  '#ca8a04',
  '#2563eb',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#9333ea',
]

/** Shared program fields for the superadmin dialog and the program-admin profile page. */
export function ProgramFields({
  form,
  color,
  codeLocked,
}: {
  form: UseFormReturn<ProgramValues>
  color: string
  codeLocked: boolean
}) {
  const errors = form.formState.errors
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <FormField
          id="code"
          label="Code"
          error={errors.code?.message}
          hint={codeLocked ? 'Only a superadmin can change it' : undefined}
        >
          <Input
            id="code"
            className="uppercase"
            disabled={codeLocked}
            aria-invalid={!!errors.code}
            {...form.register('code')}
          />
        </FormField>
        <FormField id="name" label="Program name" error={errors.name?.message}>
          <Input id="name" aria-invalid={!!errors.name} {...form.register('name')} />
        </FormField>
      </div>
      <FormField id="description" label="Description">
        <Textarea id="description" rows={3} {...form.register('description')} />
      </FormField>
      <FormField id="color" label="Color" error={errors.color?.message}>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => form.setValue('color', c, { shouldDirty: true })}
              className={cn(
                'size-7 rounded-full border-2 transition-transform hover:scale-110',
                color.toLowerCase() === c ? 'border-foreground' : 'border-transparent',
              )}
              style={{ backgroundColor: c }}
              aria-label={`Use color ${c}`}
            />
          ))}
          <input
            id="color"
            type="color"
            className="h-7 w-10 cursor-pointer rounded border bg-transparent"
            {...form.register('color')}
            aria-label="Custom color"
          />
        </div>
      </FormField>
    </>
  )
}
