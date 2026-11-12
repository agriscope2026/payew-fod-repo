import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { useSetWfpStatus, useWfpStatusChoices } from '@/features/sheets/api'
import { errorMessage } from '@/lib/supabase'
import type { ActivityPhysicalRow } from '@/types/database'

/**
 * The activity's status. It is the Status column of its WFP row, so changing it here
 * changes the WFP, and the other way round.
 */
export function WfpStatusSelect({
  physical,
  canEdit,
  id = 'wfp-status',
}: {
  physical: ActivityPhysicalRow | undefined
  canEdit: boolean
  id?: string
}) {
  const linked = !!physical?.wfp_sheet_id && !!physical.wfp_row_id && !physical.wfp_removed_at
  const { data: choices = [] } = useWfpStatusChoices(linked ? physical!.wfp_sheet_id : null)
  const set = useSetWfpStatus()
  const current = physical?.wfp_status ?? ''
  if (!linked) {
    return (
      <p className="text-muted-foreground text-xs">
        Status is set on the activity’s row in the WFP. This activity is not in the WFP.
      </p>
    )
  }
  const options = current && !choices.includes(current) ? [...choices, current] : choices
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Status
      </label>
      <select
        id={id}
        disabled={!canEdit || set.isPending}
        className="bg-background h-9 min-w-48 rounded-md border px-2 text-sm"
        value={current}
        onChange={(e) =>
          set
            .mutateAsync({
              sheetId: physical!.wfp_sheet_id!,
              rowId: physical!.wfp_row_id!,
              status: e.target.value,
            })
            .then(() => toast.success('Status updated here and in the WFP'))
            .catch((err) => toast.error(errorMessage(err)))
        }
      >
        <option value="">Not set</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {set.isPending && <Loader2Icon className="text-muted-foreground size-4 animate-spin" />}
      <span className="text-muted-foreground text-xs">Same as the Status column in the WFP.</span>
    </div>
  )
}
