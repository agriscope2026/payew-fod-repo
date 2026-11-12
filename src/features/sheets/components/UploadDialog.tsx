import {
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  LinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchGoogleSheet } from '@/features/imports/api'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { readBed } from '../convert'
import { buildFromUpload, checkUpload, type UploadCheck } from '../intake'
import { createEvaluator, type Sheet, type SheetKind } from '../model'
import { templateFor } from '../templates'
import { resolveRoles } from '../wfp'
import { readSpreadsheet, type UploadedTab } from '../xlsx-io'

const MAX_BYTES = 15 * 1024 * 1024

/**
 * Picks a file or Google Sheet and one of its tabs. A tab is accepted only when it
 * has the template's columns (or, for the WFP, is the DA-CAR AWFP form). Its rows
 * then open as a draft in the template layout.
 */
export function UploadDialog({
  open,
  onOpenChange,
  kind,
  sheetLabel,
  onUpload,
  onDownloadTemplate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: SheetKind
  sheetLabel: string
  onUpload: (sheet: Sheet, source: string) => Promise<void>
  onDownloadTemplate: () => void
}) {
  const wfp = kind === 'WFP'
  const [method, setMethod] = useState<'file' | 'link'>('file')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState('')
  const [tabs, setTabs] = useState<UploadedTab[] | null>(null)
  const [tabName, setTabName] = useState('')
  const [targetsTab, setTargetsTab] = useState('')
  const [statusTab, setStatusTab] = useState('')

  const reset = () => {
    setTabs(null)
    setTabName('')
    setSource('')
    setTargetsTab('')
    setStatusTab('')
  }

  const evaluator = useMemo(
    () => createEvaluator({ sheets: new Map((tabs ?? []).map((t) => [t.name, t.sheet])) }),
    [tabs],
  )
  const checks = useMemo(
    () =>
      new Map<string, UploadCheck>(
        (tabs ?? []).map((t) => [t.name, checkUpload(kind, t.sheet, t.name, evaluator)]),
      ),
    [tabs, kind, evaluator],
  )

  const read = async (data: ArrayBuffer, name: string, label: string) => {
    const list = await readSpreadsheet(data, name)
    if (!list.length) throw new Error('That file has no sheets.')
    const ev = createEvaluator({ sheets: new Map(list.map((t) => [t.name, t.sheet])) })
    const kindOf = (t: UploadedTab) => checkUpload(kind, t.sheet, t.name, ev).kind
    const visible = list.filter((t) => !t.hidden)
    // Prefer a tab already in the template layout, then the AWFP form that tracks
    // payments or obligations, then any other acceptable tab.
    const best =
      visible.find((t) => kindOf(t) === 'template') ??
      visible.find((t) => kindOf(t) === 'awfp' && resolveRoles(t.sheet).paid !== undefined) ??
      visible.find((t) => kindOf(t) === 'awfp' && resolveRoles(t.sheet).obligated !== undefined) ??
      visible.find((t) => kindOf(t) !== 'mismatch') ??
      list.find((t) => kindOf(t) !== 'mismatch')
    setTabs(list)
    setSource(label)
    setTabName(best?.name ?? '')
    if (wfp) {
      setTargetsTab(visible.find((t) => /^bed\s*2$/i.test(t.name.trim()))?.name ?? '')
      setStatusTab(visible.find((t) => /accomplishment/i.test(t.name))?.name ?? '')
    }
  }

  const fromFile = async (file: File) => {
    if (file.size > MAX_BYTES) return toast.error('Files up to 15 MB can be uploaded.')
    setBusy(true)
    try {
      await read(await file.arrayBuffer(), file.name, file.name)
    } catch (e) {
      toast.error(
        errorMessage(e, 'That file could not be read. Save it as .xlsx or .csv and try again.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const fromLink = async () => {
    setBusy(true)
    try {
      const bytes = await fetchGoogleSheet(url.trim())
      const data = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer
      await read(data, 'sheet.xlsx', 'Google Sheet')
    } catch (e) {
      toast.error(
        errorMessage(
          e,
          'That link could not be opened. Check it is shared with "Anyone with the link".',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const tab = tabs?.find((t) => t.name === tabName)
  const check = tab ? checks.get(tab.name) : undefined
  const accepted = !!check && check.kind !== 'mismatch'
  const anyAccepted = [...checks.values()].some((c) => c.kind !== 'mismatch')

  const confirm = async () => {
    if (!tab || !check || check.kind === 'mismatch') return
    setBusy(true)
    try {
      const bed = (name: string) => {
        const t = tabs!.find((x) => x.name === name)
        return t ? readBed(t.sheet, t.name, evaluator) : undefined
      }
      const sheet = buildFromUpload(kind, tab.sheet, tab.name, evaluator, check, {
        targets: wfp ? bed(targetsTab) : undefined,
        statuses: wfp ? bed(statusTab) : undefined,
      })
      await onUpload(sheet, `${source} · ${tab.name}`.slice(0, 200))
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const templateLink = (
    <button
      type="button"
      className="text-primary inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
      onClick={onDownloadTemplate}
    >
      <DownloadIcon className="size-3.5" /> Download the {sheetLabel} template
    </button>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload into the {sheetLabel}</DialogTitle>
          <DialogDescription>
            The file must have the columns of the {templateFor(kind).name} template
            {wfp ? ', or be the DA-CAR AWFP form, which is converted for you' : ''}. Its rows open
            as a draft to review before they replace the {sheetLabel}.
          </DialogDescription>
        </DialogHeader>

        {!tabs ? (
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
              Starting a new file? {templateLink}, fill it in, then upload it here.
            </div>
            <div className="bg-muted inline-flex rounded-md p-0.5" role="group" aria-label="Source">
              {(
                [
                  ['file', 'File', FileSpreadsheetIcon],
                  ['link', 'Google Sheet link', LinkIcon],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={method === value}
                  onClick={() => setMethod(value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-3 py-1 text-sm',
                    method === value ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            {method === 'file' ? (
              <div className="space-y-1.5">
                <Label htmlFor="sheet-file">Excel, CSV or OpenDocument file</Label>
                <Input
                  id="sheet-file"
                  type="file"
                  disabled={busy}
                  accept=".xlsx,.xlsm,.xls,.csv,.ods"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void fromFile(file)
                  }}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="sheet-url">
                  Link to a Google Sheet shared with “Anyone with the link”
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="sheet-url"
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && url.trim() && !busy) void fromLink()
                    }}
                  />
                  <Button disabled={busy || !url.trim()} onClick={() => void fromLink()}>
                    {busy && <Loader2Icon className="animate-spin" />} Open
                  </Button>
                </div>
              </div>
            )}
            {busy && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
                <Loader2Icon className="size-4 animate-spin" /> Reading the file…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="text-muted-foreground">From </span>
              {source}. {anyAccepted ? 'Pick the tab to use:' : ''}
            </p>
            {!anyAccepted && (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/5 space-y-1 rounded-md border px-3 py-2 text-sm"
              >
                <p className="font-medium">No tab in this file has the template’s columns.</p>
                <p>{templateLink} and copy your data into it.</p>
              </div>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {tabs.map((t) => {
                const c = checks.get(t.name)!
                const ok = c.kind !== 'mismatch'
                return (
                  <label
                    key={t.name}
                    className={cn(
                      'flex items-start gap-3 rounded-md border px-3 py-2 text-sm',
                      ok ? 'hover:bg-accent cursor-pointer' : 'opacity-70',
                      tabName === t.name && 'border-primary bg-primary/5',
                    )}
                  >
                    <input
                      type="radio"
                      name="tab"
                      className="mt-1"
                      disabled={!ok}
                      checked={tabName === t.name}
                      onChange={() => setTabName(t.name)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{t.name}</span>
                      {t.hidden && <span className="text-muted-foreground"> · hidden</span>}
                      <span
                        className={cn(
                          'mt-0.5 flex items-start gap-1 text-xs',
                          ok ? 'text-success' : 'text-muted-foreground',
                        )}
                      >
                        {c.kind === 'template' ? (
                          <>
                            <CheckCircle2Icon className="mt-px size-3.5 shrink-0" /> Matches the
                            template
                          </>
                        ) : c.kind === 'awfp' ? (
                          <>
                            <RefreshCwIcon className="mt-px size-3.5 shrink-0" /> DA-CAR AWFP form ·
                            will be converted to the template
                          </>
                        ) : (
                          <>
                            <XCircleIcon className="mt-px size-3.5 shrink-0" />
                            <span>
                              Not the template
                              {c.found > 0 &&
                                ` · missing ${c.missing.slice(0, 4).join(', ')}${c.missing.length > 4 ? ` and ${c.missing.length - 4} more` : ''}`}
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            {wfp && accepted && (
              <div className="bg-muted/40 grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                {(
                  [
                    ['Monthly physical targets from', targetsTab, setTargetsTab],
                    ['Status from', statusTab, setStatusTab],
                  ] as const
                ).map(([label, value, set]) => (
                  <label key={label} className="space-y-1 text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <select
                      className="bg-background h-8 w-full rounded border px-1.5"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                    >
                      <option value="">None</option>
                      {tabs.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <p className="text-muted-foreground text-xs sm:col-span-2">
                  These fill the Activities page: targets per month (BED 2) and each activity’s
                  status.
                </p>
              </div>
            )}
            {tab?.truncated && accepted && (
              <p className="text-warning text-sm">
                This tab is larger than a PAYEW sheet (5,000 rows). The extra rows are left out.
              </p>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={reset} disabled={busy}>
                Back
              </Button>
              <Button onClick={() => void confirm()} disabled={busy || !accepted}>
                {busy && <Loader2Icon className="animate-spin" />} Open as draft
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
