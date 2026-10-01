import { LockIcon } from 'lucide-react'
import { SelectNative } from '@/components/ui/select-native'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'

/** Fiscal year + program scope, shown in the top bar and used by every page. */
export function WorkspaceFilters() {
  const { isSuperadmin } = useAuth()
  const ws = useWorkspace()

  return (
    <div className="flex items-center gap-2">
      <SelectNative
        aria-label="Fiscal year"
        className="w-28"
        value={ws.fiscalYear?.id ?? ''}
        onChange={(e) => ws.setFiscalYearId(e.target.value)}
        disabled={ws.fiscalYears.length === 0}
      >
        {ws.fiscalYears.map((fy) => (
          <option key={fy.id} value={fy.id}>
            {fy.label}
            {fy.status !== 'open' ? ` (${fy.status})` : ''}
          </option>
        ))}
      </SelectNative>

      {ws.canChangeProgram ? (
        <SelectNative
          aria-label="Program"
          className="w-36 sm:w-44"
          value={ws.programFilter}
          onChange={(e) => ws.setProgramFilter(e.target.value)}
        >
          {isSuperadmin && <option value="all">All Programs</option>}
          {ws.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
              {p.archived_at ? ' (archived)' : ''}
            </option>
          ))}
        </SelectNative>
      ) : (
        <span
          className="bg-muted hidden h-9 items-center gap-1.5 rounded-md border px-3 text-sm sm:inline-flex"
          title="You can only view your own program"
        >
          <LockIcon className="text-muted-foreground size-3.5" />
          {ws.programs[0]?.code ?? '—'}
        </span>
      )}
    </div>
  )
}
