import { useQueryClient } from '@tanstack/react-query'
import { DownloadIcon, FileSpreadsheetIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { parseWorkbook } from '@/features/beneficiaries/excel'
import { useLocations } from '@/features/locations/api'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { importSuppliers, suppliersKey, useSuppliers } from '../api'
import { downloadSupplierTemplate } from '../excel'
import { validateSuppliers, type ValidatedSupplier } from '../supplier-logic'

/** Excel import: template → upload → preview with errors/warnings → import valid rows. */
export function ImportSuppliersDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: locations } = useLocations()
  const { categories } = useProcurementLookups()
  const { data: existing = [] } = useSuppliers()
  const [rows, setRows] = useState<ValidatedSupplier[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)

  const valid = rows?.filter((r) => !r.errors.length) ?? []
  const invalid = rows?.filter((r) => r.errors.length) ?? []

  const read = async (file: File) => {
    setBusy(true)
    try {
      const [sheet] = await parseWorkbook(file)
      if (!sheet?.rows.length) throw new Error('The first sheet has no rows.')
      if (sheet.rows.length > 1000) throw new Error('Import at most 1,000 suppliers at a time.')
      setFileName(file.name)
      setRows(
        validateSuppliers(sheet.rows, {
          provinces: locations?.provinces ?? [],
          municipalities: locations?.municipalities ?? [],
          barangays: locations?.barangays ?? [],
          categories,
          existing,
        }),
      )
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    setBusy(true)
    try {
      const n = await importSuppliers(valid.map((r) => r.payload))
      await queryClient.invalidateQueries({ queryKey: suppliersKey })
      toast.success(`${n} supplier${n === 1 ? '' : 's'} imported`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import suppliers from Excel</DialogTitle>
          <DialogDescription>
            Use the template's column names. Rows with errors are skipped; nothing is saved until
            you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void downloadSupplierTemplate(categories)}>
            <DownloadIcon /> Download template
          </Button>
          <Button variant="outline" asChild disabled={busy}>
            <label className="cursor-pointer">
              <UploadIcon /> Choose file…
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void read(f)
                }}
              />
            </label>
          </Button>
        </div>

        {rows && (
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheetIcon className="text-primary size-4" /> {fileName}:
              <Badge variant="outline" className="border-success/40 text-success">
                {valid.length} ready
              </Badge>
              {invalid.length > 0 && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  {invalid.length} with errors
                </Badge>
              )}
            </p>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border text-sm">
              {rows.map((r) => (
                <li
                  key={r.rowNumber}
                  className={cn('px-3 py-2', r.errors.length && 'bg-destructive/5')}
                >
                  <span className="text-muted-foreground mr-2 font-mono text-xs">
                    Row {r.rowNumber}
                  </span>
                  <span className="font-medium">{r.name || '(no name)'}</span>
                  {r.errors.map((e) => (
                    <span key={e} className="text-destructive block text-xs">
                      ✕ {e}
                    </span>
                  ))}
                  {r.warnings.map((w) => (
                    <span key={w} className="block text-xs text-[oklch(0.5_0.13_70)]">
                      ! {w}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid.length || busy} onClick={() => void run()}>
            {busy && <Loader2Icon className="animate-spin" />}
            Import {valid.length || ''} supplier{valid.length === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
