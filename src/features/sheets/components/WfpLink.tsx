import { Loader2Icon, RefreshCwIcon, Share2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { colName } from '../formula'
import type { ColumnRole, Sheet } from '../model'
import { headerLabels, resolveRoles, ROLE_LABEL } from '../wfp'

const ROLES = Object.keys(ROLE_LABEL) as ColumnRole[]

/**
 * Where WFP data goes (Activities, ORS, DV, PPMP, APP) and which columns feed it. Detected from the headers; anyone who
 * can edit the sheet can point a role at another column.
 */
export function WfpLink({
  sheet,
  activityCount,
  readOnly,
  syncing,
  canSync,
  onChange,
  onSync,
}: {
  sheet: Sheet
  activityCount: number
  readOnly: boolean
  syncing: boolean
  canSync: boolean
  onChange: (next: Sheet) => void
  onSync: () => void
}) {
  const roles = resolveRoles(sheet)
  const labels = headerLabels(sheet)
  const setRole = (role: ColumnRole, c: string) => {
    const next = { ...(sheet.roles ?? {}) }
    if (c === '') delete next[role]
    else next[role] = sheet.cols[Number(c)].id
    onChange({ ...sheet, roles: next })
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Share2Icon /> Linked sheets
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3">
        <div>
          <p className="text-sm font-medium">The WFP feeds these pages</p>
          <p className="text-muted-foreground text-xs">
            Saving the WFP updates them. Activities (Physical): {activityCount}{' '}
            {activityCount === 1 ? 'activity' : 'activities'}, each row with an activity and a unit
            of measure. ORS register: rows with a supplier or PO. DV register: rows with an amount
            for disbursement. PPMP: budget lines. APP: one row per activity.
          </p>
          <p className="mt-2 text-xs font-medium">Columns the WFP reads</p>
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-xs">
              <span className="w-36 shrink-0">{ROLE_LABEL[role]}</span>
              <select
                className="bg-background h-8 min-w-0 flex-1 rounded border px-1.5"
                disabled={readOnly}
                value={roles[role] ?? ''}
                onChange={(e) => setRole(role, e.target.value)}
              >
                <option value="">Not used</option>
                {sheet.cols.map((_, c) => (
                  <option key={c} value={c}>
                    {colName(c)} · {labels[c] ? labels[c].slice(0, 40) : '(no header)'}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <Button size="sm" className="w-full" disabled={!canSync || syncing} onClick={onSync}>
          {syncing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Update linked
          sheets now
        </Button>
        {!canSync && !readOnly && (
          <p className="text-muted-foreground text-xs">Save the sheet first.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
