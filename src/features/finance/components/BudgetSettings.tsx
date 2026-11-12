import { Loader2Icon, SaveIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { FinanceScope } from '../api'
import { useSaveYearBudget, useYearBudgets } from '../budget-api'

/** Finance → Budget settings: each program's total budget for the fiscal year. */
export function BudgetSettings({ scope }: { scope: FinanceScope }) {
  const { profile, programs } = useAuth()
  const { data: budgets, isPending } = useYearBudgets(scope)
  const programIds = programs.map((p) => p.id)
  const shown = programs.filter((p) => scope.programIds.includes(p.id))

  if (isPending || !budgets) return <Skeleton className="h-48" />
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        The total budget of each program for this fiscal year. Program admins can change it.
      </p>
      <div className="bg-card overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead className="w-80">Total budget for the year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p) => (
              <BudgetRow
                key={`${p.id}-${budgets.get(p.id) ?? 'none'}`}
                program={p}
                fiscalYearId={scope.fiscalYearId!}
                total={budgets.get(p.id) ?? null}
                canEdit={canManageProgram(profile, programIds, p.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function BudgetRow({
  program,
  fiscalYearId,
  total,
  canEdit,
}: {
  program: { id: string; code: string; name: string }
  fiscalYearId: string
  total: number | null
  canEdit: boolean
}) {
  const save = useSaveYearBudget()
  const [text, setText] = useState(total === null ? '' : String(total))
  const value = Number(text.replace(/[,₱\s]/g, ''))
  const valid = text.trim() !== '' && Number.isFinite(value) && value >= 0

  const submit = () =>
    save
      .mutateAsync({ programId: program.id, fiscalYearId, total: value })
      .then(() => toast.success(`${program.code} budget saved`))
      .catch((e) => toast.error(errorMessage(e)))

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{program.code}</span>
        <span className="text-muted-foreground block text-xs">{program.name}</span>
      </TableCell>
      <TableCell>
        {canEdit ? (
          <div className="flex gap-2">
            <Input
              aria-label={`${program.code} total budget`}
              inputMode="decimal"
              placeholder="0.00"
              className="text-right tabular-nums"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!valid || value === total || save.isPending}
              onClick={() => void submit()}
            >
              {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
            </Button>
          </div>
        ) : (
          <span className="tabular-nums">{total === null ? 'Not set' : formatPeso(total)}</span>
        )}
      </TableCell>
    </TableRow>
  )
}
