import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SelectNative } from '@/components/ui/select-native'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { canWriteProgram } from '@/features/auth/permissions'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { beneficiariesKey, importBeneficiaries, matchExisting } from '../api'
import { downloadTemplate, parseWorkbook, type ParsedSheet } from '../excel'
import { autoMapColumns, IMPORT_COLUMNS, validateRows, type ValidatedRow } from '../import-logic'
import { useBeneficiaryLookups } from '../use-lookups'

const FOD = '__fod__'
type Step = 'file' | 'map' | 'review' | 'done'
type Reviewed = ValidatedRow & { duplicateOf?: { id: string; name: string; similarity: number } }

export function ImportBeneficiariesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return open ? <ImportWizard onOpenChange={onOpenChange} /> : null
}

function ImportWizard({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { profile, programs, isSuperadmin } = useAuth()
  const { lookups } = useBeneficiaryLookups()
  const queryClient = useQueryClient()

  const programIds = programs.map((p) => p.id)
  const writable = programs.filter(
    (p) => !p.archived_at && canWriteProgram(profile, programIds, p.id),
  )
  const [programId, setProgramId] = useState(writable[0]?.id ?? (isSuperadmin ? FOD : ''))
  const [step, setStep] = useState<Step>('file')
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [rows, setRows] = useState<Reviewed[]>([])
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [imported, setImported] = useState(0)

  const sheet = sheets[sheetIndex]
  const missingRequired = IMPORT_COLUMNS.filter((c) => c.required && !mapping[c.key])

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const parsed = (await parseWorkbook(file)).filter((s) => s.headers.length > 0)
      if (!parsed.length) throw new Error('No data found in this file.')
      // Prefer the sheet named like our template, otherwise the first one.
      const idx = Math.max(
        0,
        parsed.findIndex((s) => /beneficiar/i.test(s.name)),
      )
      setFileName(file.name)
      setSheets(parsed)
      setSheetIndex(idx)
      setMapping(autoMapColumns(parsed[idx].headers))
      setStep('map')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not read this file. Use .xlsx, .xls or .csv.'))
    } finally {
      setBusy(false)
    }
  }

  const review = async () => {
    setBusy(true)
    try {
      const validated = validateRows(sheet.rows, mapping, lookups)
      if (!validated.length) throw new Error('The sheet has no data rows.')
      const candidates = validated.map((r) => ({ name: r.name, municipality_id: r.municipalityId }))
      const matches = await matchExisting(candidates)
      setRows(
        validated.map((r, i) => {
          const m = matches.get(i)
          return m ? { ...r, duplicateOf: { id: m.id, name: m.name, similarity: m.similarity } } : r
        }),
      )
      setStep('review')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const importable = rows.filter((r) => r.errors.length === 0 && !(skipDuplicates && r.duplicateOf))
  const counts = useMemo(
    () => ({
      errors: rows.filter((r) => r.errors.length).length,
      duplicates: rows.filter((r) => r.duplicateOf).length,
      warnings: rows.filter((r) => r.warnings.length).length,
    }),
    [rows],
  )

  const runImport = async () => {
    setBusy(true)
    try {
      const n = await importBeneficiaries(
        programId === FOD ? null : programId,
        importable.map((r) => r.payload),
      )
      setImported(n)
      setStep('done')
      await queryClient.invalidateQueries({ queryKey: beneficiariesKey })
    } catch (err) {
      const before = (err as { importedBefore?: number }).importedBefore ?? 0
      toast.error(
        `${errorMessage(err)}${before ? ` (${before} rows were imported before the error)` : ''}`,
      )
      if (before) await queryClient.invalidateQueries({ queryKey: beneficiariesKey })
    } finally {
      setBusy(false)
    }
  }

  const visibleRows = onlyProblems
    ? rows.filter((r) => r.errors.length || r.warnings.length || r.duplicateOf)
    : rows

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import beneficiaries from Excel</DialogTitle>
          <DialogDescription>
            {step === 'file' && 'Step 1 of 3 · Choose the registering program and the file.'}
            {step === 'map' && `Step 2 of 3 · Match the columns of ${fileName}.`}
            {step === 'review' && 'Step 3 of 3 · Review. Nothing is saved until you import.'}
            {step === 'done' && 'Import finished.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'file' && (
          <div className="space-y-4">
            <FormField id="imp-program" label="Registered by">
              <SelectNative
                id="imp-program"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
              >
                {writable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
                {isSuperadmin && <option value={FOD}>FOD (no specific program)</option>}
              </SelectNative>
            </FormField>
            <label
              className={cn(
                'hover:border-primary/50 hover:bg-accent/40 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center',
                busy && 'pointer-events-none opacity-60',
              )}
            >
              {busy ? (
                <Loader2Icon className="text-primary size-8 animate-spin" />
              ) : (
                <FileSpreadsheetIcon className="text-primary size-8" />
              )}
              <span className="text-sm font-medium">Choose an .xlsx, .xls or .csv file</span>
              <span className="text-muted-foreground text-xs">
                The first row must contain the column headers.
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
            </label>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => void downloadTemplate(lookups)}
            >
              <DownloadIcon /> Download the template (with valid types, locations and commodities)
            </Button>
          </div>
        )}

        {step === 'map' && sheet && (
          <div className="space-y-4">
            {sheets.length > 1 && (
              <FormField id="imp-sheet" label="Sheet">
                <SelectNative
                  id="imp-sheet"
                  value={sheetIndex}
                  onChange={(e) => {
                    const i = Number(e.target.value)
                    setSheetIndex(i)
                    setMapping(autoMapColumns(sheets[i].headers))
                  }}
                >
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} ({s.rows.length} rows)
                    </option>
                  ))}
                </SelectNative>
              </FormField>
            )}
            <p className="text-muted-foreground text-sm">
              {sheet.rows.length} rows found. Columns were matched automatically; adjust any that
              are wrong.
            </p>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {IMPORT_COLUMNS.map((c) => (
                <div key={c.key} className="grid grid-cols-[10rem_1fr] items-center gap-2">
                  <label htmlFor={`map-${c.key}`} className="text-sm">
                    {c.header}
                    {c.required && <span className="text-destructive"> *</span>}
                  </label>
                  <SelectNative
                    id={`map-${c.key}`}
                    value={mapping[c.key] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })}
                  >
                    <option value="">— not in file —</option>
                    {sheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p className="text-destructive text-sm">
                Map the required columns: {missingRequired.map((c) => c.header).join(', ')}
              </p>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('file')}>
                Back
              </Button>
              <Button onClick={() => void review()} disabled={busy || missingRequired.length > 0}>
                {busy && <Loader2Icon className="animate-spin" />} Check rows
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2Icon className="text-success" /> {importable.length} ready
              </Badge>
              {counts.errors > 0 && (
                <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
                  <XCircleIcon /> {counts.errors} with errors (skipped)
                </Badge>
              )}
              {counts.duplicates > 0 && (
                <Badge variant="outline" className="gap-1">
                  <AlertTriangleIcon className="text-[oklch(0.6_0.14_70)]" /> {counts.duplicates}{' '}
                  possible duplicates
                </Badge>
              )}
              {counts.warnings > 0 && (
                <Badge variant="outline">{counts.warnings} with warnings</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {counts.duplicates > 0 && (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={skipDuplicates}
                    onCheckedChange={(c) => setSkipDuplicates(!!c)}
                  />
                  Skip rows that match an existing beneficiary
                </label>
              )}
              <label className="flex items-center gap-2">
                <Checkbox checked={onlyProblems} onCheckedChange={(c) => setOnlyProblems(!!c)} />
                Show only rows that need attention
              </label>
            </div>
            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="bg-muted sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {r.rowNumber}
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.name || <em className="text-muted-foreground">blank</em>}
                      </TableCell>
                      <TableCell className="space-y-0.5 text-xs">
                        {r.errors.map((e) => (
                          <p key={e} className="text-destructive flex gap-1">
                            <XCircleIcon className="mt-px size-3.5 shrink-0" /> {e}
                          </p>
                        ))}
                        {r.duplicateOf && (
                          <p className="flex gap-1">
                            <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-[oklch(0.6_0.14_70)]" />
                            Looks like existing “{r.duplicateOf.name}” (
                            {Math.round(r.duplicateOf.similarity * 100)}%)
                            {skipDuplicates ? ', skipped' : ''}
                          </p>
                        )}
                        {r.warnings.map((w) => (
                          <p key={w} className="text-muted-foreground flex gap-1">
                            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" /> {w}
                          </p>
                        ))}
                        {!r.errors.length && !r.warnings.length && !r.duplicateOf && (
                          <p className="text-success flex gap-1">
                            <CheckCircle2Icon className="mt-px size-3.5 shrink-0" /> Ready
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('map')} disabled={busy}>
                Back
              </Button>
              <Button onClick={() => void runImport()} disabled={busy || importable.length === 0}>
                {busy && <Loader2Icon className="animate-spin" />}
                Import {importable.length} beneficiar{importable.length === 1 ? 'y' : 'ies'}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2Icon className="text-success size-10" />
            <p className="text-lg font-semibold">{imported} beneficiaries imported</p>
            <p className="text-muted-foreground text-sm">
              {rows.length - imported > 0 && `${rows.length - imported} rows were skipped. `}
              Fix skipped rows in the file and import them again if needed.
            </p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
