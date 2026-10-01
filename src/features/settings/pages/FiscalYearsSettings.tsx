import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarPlusIcon, Loader2Icon, LockIcon, MoreHorizontalIcon, StarIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { ErrorState } from '@/components/common/ErrorState'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useFiscalYears } from '@/features/workspace/api'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { FiscalYearRow, FiscalYearStatus } from '@/types/database'
import { useCreateFiscalYear, useSetCurrentFiscalYear, useSetFiscalYearStatus } from '../api'

const STATUS_INFO: Record<FiscalYearStatus, { label: string; hint: string; className: string }> = {
  draft: { label: 'Draft', hint: 'Planning only', className: 'bg-muted text-muted-foreground' },
  open: { label: 'Open', hint: 'Encoding allowed', className: 'bg-success/15 text-success' },
  closed: {
    label: 'Closed',
    hint: 'Year ended; admins may still correct',
    className: 'bg-warning/20 text-[oklch(0.45_0.1_70)]',
  },
  locked: {
    label: 'Locked',
    hint: 'Read-only for everyone',
    className: 'bg-destructive/10 text-destructive',
  },
}

/** Allowed transitions; locking is final unless a superadmin unlocks back to closed. */
const TRANSITIONS: Record<FiscalYearStatus, FiscalYearStatus[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: ['open', 'locked'],
  locked: ['closed'],
}

const createSchema = z
  .object({
    year: z.coerce.number<number>().int().min(2000).max(2100),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
  })
  .refine((v) => v.end_date > v.start_date, {
    path: ['end_date'],
    message: 'Must be after the start date',
  })

export default function FiscalYearsSettings() {
  const { data = [], isPending, isError, refetch } = useFiscalYears()
  const setStatus = useSetFiscalYearStatus()
  const setCurrent = useSetCurrentFiscalYear()
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  const changeStatus = (fy: FiscalYearRow, status: FiscalYearStatus) =>
    setConfirm({
      title: `Set ${fy.label} to ${STATUS_INFO[status].label}?`,
      description:
        status === 'locked'
          ? 'Locking makes all finance and activity records of this year read-only.'
          : `${STATUS_INFO[status].hint}. Everyone will be notified.`,
      confirmLabel: STATUS_INFO[status].label,
      destructive: status === 'locked',
      onConfirm: async () => {
        try {
          await setStatus.mutateAsync({ id: fy.id, status })
          toast.success(`${fy.label} is now ${status}`)
        } catch (err) {
          toast.error(errorMessage(err))
        }
      },
    })

  const makeCurrent = async (fy: FiscalYearRow) => {
    try {
      await setCurrent.mutateAsync(fy.id)
      toast.success(`${fy.label} is now the default fiscal year`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (isError) return <ErrorState onRetry={() => void refetch()} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          The <strong>current</strong> year is the default in every filter. The rollover wizard
          (copy setup, carry over balances) arrives in Phase 11.
        </p>
        <Button onClick={() => setCreating(true)}>
          <CalendarPlusIcon /> New fiscal year
        </Button>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Fiscal year</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending
              ? Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-5" />
                    </TableCell>
                  </TableRow>
                ))
              : data.map((fy) => (
                  <TableRow key={fy.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {fy.label}
                        {fy.is_current && (
                          <Badge className="gap-1">
                            <StarIcon className="fill-current" /> Current
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatDate(fy.start_date)} – {formatDate(fy.end_date)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border-transparent ${STATUS_INFO[fy.status].className}`}
                      >
                        {fy.status === 'locked' && <LockIcon />}
                        {STATUS_INFO[fy.status].label}
                      </Badge>
                      <span className="text-muted-foreground ml-2 hidden text-xs md:inline">
                        {STATUS_INFO[fy.status].hint}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Actions for ${fy.label}`}
                          >
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={fy.is_current}
                            onSelect={() => void makeCurrent(fy)}
                          >
                            <StarIcon /> Set as current
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {TRANSITIONS[fy.status].map((next) => (
                            <DropdownMenuItem
                              key={next}
                              variant={next === 'locked' ? 'destructive' : 'default'}
                              onSelect={() => changeStatus(fy, next)}
                            >
                              {next === 'open' && fy.status !== 'draft'
                                ? 'Reopen'
                                : next === 'closed' && fy.status === 'locked'
                                  ? 'Unlock (set to closed)'
                                  : `Mark as ${STATUS_INFO[next].label.toLowerCase()}`}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Card>

      <CreateFiscalYearDialog
        open={creating}
        onOpenChange={setCreating}
        nextYear={Math.max(new Date().getFullYear(), ...data.map((f) => f.year + 1))}
      />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function CreateFiscalYearDialog({
  open,
  onOpenChange,
  nextYear,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nextYear: number
}) {
  const create = useCreateFiscalYear()
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    values: { year: nextYear, start_date: `${nextYear}-01-01`, end_date: `${nextYear}-12-31` },
  })
  const errors = form.formState.errors

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await create.mutateAsync({ ...v, label: `FY ${v.year}` })
      toast.success(`FY ${v.year} created as draft`)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New fiscal year</DialogTitle>
          <DialogDescription>
            Created as a draft. Open it when budgets can be encoded.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="year" label="Year" error={errors.year?.message}>
            <Input
              id="year"
              type="number"
              {...form.register('year', {
                onChange: (e) => {
                  const y = Number(e.target.value)
                  if (y >= 2000 && y <= 2100) {
                    form.setValue('start_date', `${y}-01-01`)
                    form.setValue('end_date', `${y}-12-31`)
                  }
                },
              })}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="start_date" label="Start" error={errors.start_date?.message}>
              <Input id="start_date" type="date" {...form.register('start_date')} />
            </FormField>
            <FormField id="end_date" label="End" error={errors.end_date?.message}>
              <Input id="end_date" type="date" {...form.register('end_date')} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
