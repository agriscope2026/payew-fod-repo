import { useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheetIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SelectNative } from '@/components/ui/select-native'
import { parseWorkbook } from '@/features/beneficiaries/excel'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import { parseLocations, type ParsedLocations } from './location-import'

const CHUNK = 4000

/**
 * Loads provinces, municipalities/cities and barangays from the PSA PSGC
 * publication (or a simple Province / Municipality / Barangay sheet).
 */
export function ImportLocationsDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [raw, setRaw] = useState<Record<string, unknown>[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [region, setRegion] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  const parsed: ParsedLocations | null = raw
    ? parseLocations(raw, { region: region || undefined })
    : null
  const needsRegion = !!parsed && parsed.format === 'psgc' && parsed.regions.length > 1 && !region
  const blocking = parsed?.errors.filter((e) => !/several regions/.test(e)) ?? []

  const read = async (file: File) => {
    setBusy(true)
    try {
      // The PSA workbook has the codes on its "PSGC" sheet; otherwise use the first sheet.
      const sheets = await parseWorkbook(file)
      const sheet = sheets.find((s) => /psgc/i.test(s.name)) ?? sheets[0]
      if (!sheet?.rows.length) throw new Error('The sheet has no rows.')
      const first = parseLocations(sheet.rows)
      const car = first.regions.find((r) => /cordillera|\bCAR\b/i.test(r.name))
      setRegion(first.regions.length > 1 && car ? car.code : '')
      setRaw(sheet.rows)
      setFileName(file.name)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    if (!parsed) return
    setBusy(true)
    const total = { provinces: 0, municipalities: 0, barangays: 0 }
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const { data, error } = await supabase.rpc('import_locations', {
          p_rows: parsed.rows.slice(i, i + CHUNK) as unknown as Json,
        })
        if (error) throw error
        total.provinces += data.provinces
        total.municipalities += data.municipalities
        total.barangays += data.barangays
        setProgress(Math.min(1, (i + CHUNK) / parsed.rows.length))
      }
      await queryClient.invalidateQueries({ queryKey: ['locations'] })
      await queryClient.invalidateQueries({ queryKey: ['master'] })
      toast.success(
        `Added ${total.provinces} provinces, ${total.municipalities} municipalities/cities and ${total.barangays} barangays. Existing places were kept.`,
      )
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import locations</DialogTitle>
          <DialogDescription>
            Upload the PSA PSGC publication (Excel) as downloaded from psa.gov.ph, or a sheet with
            Province, Municipality/City and Barangay columns. Places that already exist are matched
            by PSGC code or name and kept; nothing is deleted.
          </DialogDescription>
        </DialogHeader>

        <label className="hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm">
          {busy && !parsed ? (
            <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
          ) : (
            <FileSpreadsheetIcon className="text-muted-foreground size-6" />
          )}
          {fileName || 'Choose an .xlsx or .csv file'}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void read(f)
              e.target.value = ''
            }}
          />
        </label>

        {parsed && (
          <div className="space-y-3 text-sm">
            {parsed.format === 'psgc' && parsed.regions.length > 1 && (
              <FormField id="loc-region" label="Region">
                <SelectNative
                  id="loc-region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option value="">Choose a region…</option>
                  {parsed.regions.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </SelectNative>
              </FormField>
            )}
            {!needsRegion && (
              <p>
                Found <strong>{parsed.counts.provinces}</strong> provinces,{' '}
                <strong>{parsed.counts.municipalities}</strong> municipalities/cities and{' '}
                <strong>{parsed.counts.barangays}</strong> barangays
                {parsed.format === 'psgc' ? ' (PSA PSGC layout)' : ''}.
              </p>
            )}
            {blocking.length > 0 && (
              <ul className="text-destructive max-h-32 list-disc space-y-0.5 overflow-auto pl-5 text-xs">
                {blocking.slice(0, 20).map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {blocking.length > 20 && <li>…and {blocking.length - 20} more</li>}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {busy && progress > 0 && (
            <span className="text-muted-foreground mr-auto text-xs tabular-nums">
              {Math.round(progress * 100)}%
            </span>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !parsed || needsRegion || !parsed.rows.length || blocking.length > 0}
            onClick={() => void run()}
          >
            {busy && parsed ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
