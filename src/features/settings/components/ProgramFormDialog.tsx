import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage } from '@/lib/supabase'
import type { ProgramRow } from '@/types/database'
import { useSaveProgram } from '../api'
import { programDefaults, programSchema, type ProgramValues } from '../program-schema'
import { ProgramFields } from './ProgramFields'

export function ProgramFormDialog({
  open,
  onOpenChange,
  program,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  program?: ProgramRow | null
  onSaved?: (program: ProgramRow, created: boolean) => void
}) {
  const save = useSaveProgram()
  const form = useForm<ProgramValues>({
    resolver: zodResolver(programSchema),
    defaultValues: programDefaults(program),
  })
  const color = useWatch({ control: form.control, name: 'color' })

  useEffect(() => {
    if (open) form.reset(programDefaults(program))
  }, [open, program, form])

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync({
        id: program?.id,
        input: { ...v, description: v.description || null },
      })
      toast.success(program ? 'Program updated' : `Program ${saved.code} created`)
      onOpenChange(false)
      onSaved?.(saved, !program)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{program ? `Edit ${program.code}` : 'New program'}</DialogTitle>
          <DialogDescription>
            The code is used in reports and filters; the color identifies the program in charts and
            the calendar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <ProgramFields form={form} color={color} codeLocked={false} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              {program ? 'Save changes' : 'Create program'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
