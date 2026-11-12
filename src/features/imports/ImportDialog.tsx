import {
  DownloadIcon,
  FileSpreadsheetIcon,
  KeyboardIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SpreadsheetGrid, type GridColumn } from '@/components/grid/SpreadsheetGrid'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { useAuth } from '@/features/auth/auth-context'
import { formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  fetchGoogleSheet,
  useImportCommit,
  useImportContext,
  useImportTemplates,
  useTemplateMutations,
} from './api'
import {
  checkRows,
  columnLabels,
  detectLayout,
  autoMapColumns,
  extractRows,
  fitTemplate,
  rowToPayload,
  type ImportField,
  type ImportRow,
  type ImportTarget,
  type ImportTemplate,
  type SheetTab,
  type TemplateColumn,
} from './import-core'
import { builtInTemplates, IMPORT_FIELDS, NOTES_FIELD, TARGET_LABEL } from './targets'
import { downloadTemplateFile, readWorkbook } from './workbook'

type Step = 'source' | 'columns' | 'review'
type Method = 'link' | 'file' | 'manual'

export interface ImportProgram {
  id: string
  code: string
}

export interface ImportDialogProps {
  target: ImportTarget
  programs: ImportProgram[]
  fiscalYearId: string
  /** Plans only: the plan to save into and its current rows. */
  plan?: { id: string; rows: Record<string, unknown>[] }
  onClose: () => void
}

const METHODS: { id: Method; label: string; hint: string; icon: typeof LinkIcon }[] = [
  {
    id: 'link',
    label: 'Google Sheet link',
    hint: 'Fetch from a sheet shared as “Anyone with the link”',
    icon: LinkIcon,
  },
  {
    id: 'file',
    label: 'Excel or CSV file',
    hint: 'Upload a .xlsx, .xls or .csv from this computer',
    icon: UploadIcon,
  },
  {
    id: 'manual',
    label: 'Type it in',
    hint: 'Enter rows by hand, or paste from Excel',
    icon: KeyboardIcon,
  },
]

const blankRow = (): ImportRow => ({ _key: crypto.randomUUID(), _raw: {} })
const TOTALS = new Set(['amount', 'gross_amount', 'budget_amount'])

function gridColumn(
  column: Pick<TemplateColumn, 'field' | 'label'>,
  field: ImportField | undefined,
  options: ReturnType<typeof useImportContext>['options'],
): GridColumn<ImportRow> {
  if (field?.type === 'number') {
    return {
      key: column.field,
      header: field.label,
      type: 'number',
      width: field.width ?? 110,
      align: 'right',
      total: TOTALS.has(field.key),
    }
  }
  if (field?.type === 'select') {
    return {
      key: column.field,
      header: field.label,
      type: 'select',
      width: field.width ?? 150,
      options: (options[field.options ?? ''] ?? []).map(({ value, label }) => ({ value, label })),
    }
  }
  return {
    key: column.field,
    header: field?.label ?? column.label,
    type: 'text',
    width: field?.width ?? 180,
    frozen: field?.key === 'title' || (field?.key === 'description' && !!field.required),
  }
}

export function ImportDialog({ target, programs, fiscalYearId, plan, onClose }: ImportDialogProps) {
  const { profile } = useAuth()
  const fields = IMPORT_FIELDS[target]
  const builtIn = useMemo(() => builtInTemplates(target), [target])
  const { data: saved = [] } = useImportTemplates(target)
  const templates = useMemo(() => [...builtIn, ...saved], [builtIn, saved])
  const templateMutations = useTemplateMutations(target)
  const commit = useImportCommit()

  const [step, setStep] = useState<Step>('source')
  const [method, setMethod] = useState<Method>('link')
  const [programId, setProgramId] = useState(programs[0]?.id ?? '')
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [tabs, setTabs] = useState<SheetTab[]>([])
  const [tabName, setTabName] = useState('')
  const [template, setTemplate] = useState<ImportTemplate>(builtIn[0])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [mode, setMode] = useState<'add' | 'replace'>('add')
  const [newColumn, setNewColumn] = useState('')

  const { options, existing, obligations } = useImportContext(target, programId, fiscalYearId)
  const tab = tabs.find((t) => t.name === tabName)
  const owned =
    !!template.id && (template.created_by === profile?.id || profile?.role === 'superadmin')

  const pickTab = (list: SheetTab[], current: ImportTemplate) => {
    const visible = list.filter((t) => !t.hidden)
    const next =
      (current.tabHint && visible.find((t) => current.tabHint!.test(t.name))) ||
      (current.tabHeader &&
        visible.find((t) =>
          t.rows
            .slice(0, 12)
            .some((r) => r?.some((c) => typeof c === 'string' && current.tabHeader!.test(c))),
        )) ||
      visible[0] ||
      list[0]
    setTabName(next?.name ?? '')
    if (next) setTemplate(fitForTab(current, next))
  }

  /** A template that doesn't describe this tab falls back to detecting its layout. */
  const fitForTab = (current: ImportTemplate, next: SheetTab) => {
    const fitted = fitTemplate(current, next)
    if (fitted !== current || current.name !== 'PAYEW standard') return fitted
    const layout = detectLayout(next)
    const columns = autoMapColumns(fields, columnLabels(next, layout.header_row, layout.data_row))
    return { ...current, ...layout, columns }
  }

  const load = async (getData: () => Promise<ArrayBuffer | Uint8Array>) => {
    setLoading(true)
    try {
      const parsed = await readWorkbook(await getData())
      if (!parsed.some((t) => t.rows.length)) throw new Error('That spreadsheet has no data.')
      setTabs(parsed)
      pickTab(parsed, template)
      setStep('columns')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const chooseTemplate = (name: string) => {
    const next = templates.find((t) => (t.id ?? t.name) === name)
    if (!next) return
    if (tab) setTemplate(fitForTab(next, tab))
    else setTemplate(next)
    if (next.source_url && !url) setUrl(next.source_url)
  }

  const labels = useMemo(
    () => (tab ? columnLabels(tab, template.header_row, template.data_row) : []),
    [tab, template.header_row, template.data_row],
  )
  const preview = useMemo(
    () => (tab ? extractRows(tab, template, fields, options) : []),
    [tab, template, fields, options],
  )

  const updateColumn = (index: number, patch: Partial<TemplateColumn>) =>
    setTemplate((t) => ({
      ...t,
      columns: t.columns.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }))
  const removeColumn = (index: number) =>
    setTemplate((t) => ({ ...t, columns: t.columns.filter((_, i) => i !== index) }))
  const addColumn = (field: string, label: string) =>
    setTemplate((t) => ({
      ...t,
      columns: [...t.columns, { field, label, source: labels[0]?.letter ?? 'A' }],
    }))

  const saveTemplate = async (asNew: boolean) => {
    const name = asNew
      ? window.prompt('Name this template', `${template.name} (copy)`)?.trim()
      : template.name
    if (!name) return
    try {
      const stored = await templateMutations.save.mutateAsync({
        ...template,
        id: asNew ? undefined : template.id,
        name,
        source_url: method === 'link' ? url : template.source_url,
      })
      setTemplate({ ...stored, tabHint: undefined })
      toast.success(`Template “${name}” saved`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const deleteTemplate = async () => {
    if (!template.id || !window.confirm(`Delete the template “${template.name}”?`)) return
    try {
      await templateMutations.remove.mutateAsync(template.id)
      setTemplate(builtIn[0])
      toast.success('Template deleted')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const gridColumns = useMemo(() => {
    const used = new Map(template.columns.map((c) => [c.field, c]))
    for (const f of fields)
      if (f.required && !used.has(f.key))
        used.set(f.key, { field: f.key, label: f.label, source: 'A' })
    return [...used.values()].map((c) =>
      gridColumn(
        c,
        fields.find((f) => f.key === c.field),
        options,
      ),
    )
  }, [template.columns, fields, options])

  const checks = useMemo(() => checkRows(rows, fields, existing), [rows, fields, existing])
  const byKey = useMemo(() => new Map(rows.map((r, i) => [r._key, checks[i]])), [rows, checks])
  const problems = rows.flatMap((_, i) => checks[i].errors.map((e) => `Row ${i + 1}: ${e}`))
  const flagged = checks.filter((c) => c.warnings.length).length

  const proceed = async () => {
    const notes = NOTES_FIELD[target]
    const payload = rows.map((r) =>
      rowToPayload(r, fields, template.columns, notes.field, notes.limit),
    )
    try {
      const result = await commit.mutateAsync({
        target,
        programId,
        fiscalYearId,
        rows: payload,
        obligations,
        plan: plan && { id: plan.id, keep: mode === 'add' ? plan.rows : [] },
      })
      toast.success(
        result.updated !== undefined
          ? `${result.created} activities added, ${result.updated} existing ones updated`
          : `${result.saved} ${TARGET_LABEL[target]} row${result.saved === 1 ? '' : 's'} saved`,
      )
      if (result.flagged)
        toast.warning(`${result.flagged} row(s) were saved with validation flags.`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const total = rows.reduce((sum, r) => {
    const key = fields.find((f) => TOTALS.has(f.key))?.key
    return sum + (key ? Number(r[key]) || 0 : 0)
  }, 0)
  const unusedFields = fields.filter((f) => !template.columns.some((c) => c.field === f.key))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Add {TARGET_LABEL[target]}</DialogTitle>
          <DialogDescription>
            {step === 'source' &&
              'Choose where the data comes from. Nothing is saved until the last step.'}
            {step === 'columns' && 'Check which spreadsheet column feeds each PAYEW field.'}
            {step === 'review' &&
              'Edit, add or delete rows. Only what is listed here will be saved.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'source' && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Data source">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={method === m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    'rounded-md border p-3 text-left text-sm',
                    method === m.id ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <m.icon className="mb-1.5 size-4" />
                  <span className="block font-medium">{m.label}</span>
                  <span className="text-muted-foreground text-xs">{m.hint}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {programs.length > 1 && (
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Program</span>
                  <SelectNative value={programId} onChange={(e) => setProgramId(e.target.value)}>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code}
                      </option>
                    ))}
                  </SelectNative>
                </label>
              )}
              <label className="space-y-1 text-sm">
                <span className="font-medium">Template</span>
                <div className="flex gap-2">
                  <SelectNative
                    value={template.id ?? template.name}
                    onChange={(e) => chooseTemplate(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id ?? t.name} value={t.id ?? t.name}>
                        {t.name}
                      </option>
                    ))}
                  </SelectNative>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => void downloadTemplateFile(template, fields, options)}
                  >
                    <DownloadIcon /> Download
                  </Button>
                </div>
              </label>
            </div>

            {method === 'link' && (
              <div className="flex gap-2">
                <Input
                  aria-label="Google Sheet link"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button
                  disabled={!url.trim() || loading}
                  onClick={() => void load(() => fetchGoogleSheet(url))}
                >
                  {loading ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon />}{' '}
                  Fetch data
                </Button>
              </div>
            )}
            {method === 'file' && (
              <Button variant="outline" asChild disabled={loading}>
                <label className="cursor-pointer">
                  {loading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
                  {fileName || 'Choose a file'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f) return
                      setFileName(f.name)
                      void load(() => f.arrayBuffer())
                    }}
                  />
                </label>
              </Button>
            )}
            {method === 'manual' && (
              <Button
                onClick={() => {
                  setTemplate(builtIn[builtIn.length - 1])
                  setRows([blankRow()])
                  setStep('review')
                }}
              >
                <KeyboardIcon /> Start entering rows
              </Button>
            )}
          </div>
        )}

        {step === 'columns' && tab && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="space-y-1">
                <span className="font-medium">Tab</span>
                <SelectNative
                  className="w-64"
                  value={tabName}
                  onChange={(e) => {
                    const next = tabs.find((t) => t.name === e.target.value)
                    if (!next) return
                    setTabName(next.name)
                    setTemplate((t) => fitForTab(t, next))
                  }}
                >
                  {tabs.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                      {t.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </SelectNative>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Header starts at row</span>
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  value={template.header_row}
                  onChange={(e) =>
                    setTemplate((t) => ({
                      ...t,
                      header_row: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Data starts at row</span>
                <Input
                  className="w-24"
                  type="number"
                  min={2}
                  value={template.data_row}
                  onChange={(e) =>
                    setTemplate((t) => ({
                      ...t,
                      data_row: Math.max(2, Number(e.target.value) || 2),
                    }))
                  }
                />
              </label>
              <p className="text-muted-foreground ml-auto pb-2">
                {preview.length} rows will be read
              </p>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs">
                  <tr>
                    <th className="p-2">PAYEW field</th>
                    <th className="p-2">Spreadsheet column</th>
                    <th className="p-2">Multiply by</th>
                    <th className="p-2 text-center" title="A blank cell repeats the value above it">
                      Fill down
                    </th>
                    <th
                      className="p-2 text-center"
                      title="Rows with this cell blank or zero are skipped"
                    >
                      Skip if blank
                    </th>
                    <th className="p-2">If not recognized</th>
                    <th className="p-2">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {template.columns.map((c, i) => {
                    const field = fields.find((f) => f.key === c.field)
                    return (
                      <tr key={c.field} className="border-t">
                        <td className="p-1.5">
                          {field ? (
                            <span className="px-1.5">{field.label}</span>
                          ) : (
                            <Input
                              aria-label="Column name"
                              className="h-8"
                              value={c.label}
                              onChange={(e) => updateColumn(i, { label: e.target.value })}
                            />
                          )}
                        </td>
                        <td className="p-1.5">
                          <SelectNative
                            className="h-8 min-w-64"
                            aria-label={`Source of ${c.label}`}
                            value={c.source}
                            onChange={(e) => updateColumn(i, { source: e.target.value })}
                          >
                            {labels.map((l) => (
                              <option key={l.letter} value={l.letter}>
                                {l.letter}
                                {l.label ? ` · ${l.label.slice(0, 60)}` : ''}
                              </option>
                            ))}
                          </SelectNative>
                        </td>
                        <td className="p-1.5">
                          {field?.type === 'number' && (
                            <SelectNative
                              className="h-8 w-24"
                              aria-label={`Multiplier of ${c.label}`}
                              value={String(c.multiplier ?? 1)}
                              onChange={(e) =>
                                updateColumn(i, { multiplier: Number(e.target.value) })
                              }
                            >
                              <option value="1">× 1</option>
                              <option value="1000">× 1,000</option>
                              <option value="1000000">× 1,000,000</option>
                            </SelectNative>
                          )}
                        </td>
                        <td className="p-1.5 text-center">
                          <Checkbox
                            aria-label={`Fill down ${c.label}`}
                            checked={!!c.fillDown}
                            onCheckedChange={(v) => updateColumn(i, { fillDown: v === true })}
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <Checkbox
                            aria-label={`Skip rows without ${c.label}`}
                            checked={!!c.mustHave}
                            onCheckedChange={(v) => updateColumn(i, { mustHave: v === true })}
                          />
                        </td>
                        <td className="p-1.5">
                          {field?.type === 'select' && (
                            <SelectNative
                              className="h-8 w-40"
                              aria-label={`Fallback for ${c.label}`}
                              value={c.fallback ?? ''}
                              onChange={(e) =>
                                updateColumn(i, { fallback: e.target.value || undefined })
                              }
                            >
                              <option value="">Leave blank</option>
                              {(options[field.options ?? ''] ?? []).map((o) => (
                                <option key={o.value} value={o.label}>
                                  {o.label.slice(0, 40)}
                                </option>
                              ))}
                            </SelectNative>
                          )}
                        </td>
                        <td className="p-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Remove ${c.label}`}
                            onClick={() => removeColumn(i)}
                          >
                            <Trash2Icon />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {unusedFields.length > 0 && (
                <SelectNative
                  className="w-52"
                  aria-label="Add a PAYEW field"
                  value=""
                  onChange={(e) => {
                    const f = fields.find((x) => x.key === e.target.value)
                    if (f) addColumn(f.key, f.label)
                  }}
                >
                  <option value="">Add a PAYEW field…</option>
                  {unusedFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </SelectNative>
              )}
              <Input
                className="w-48"
                placeholder="New column name"
                aria-label="New column name"
                value={newColumn}
                onChange={(e) => setNewColumn(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !newColumn.trim() || template.columns.some((c) => c.label === newColumn.trim())
                }
                onClick={() => {
                  addColumn(`custom:${newColumn.trim()}`, newColumn.trim())
                  setNewColumn('')
                }}
              >
                <PlusIcon /> Add column
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void downloadTemplateFile(template, fields, options)}
                >
                  <DownloadIcon /> Download template
                </Button>
                {owned && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => void saveTemplate(false)}>
                      <SaveIcon /> Save changes
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void deleteTemplate()}>
                      Delete
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => void saveTemplate(true)}>
                  <SaveIcon /> Save as new template
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Extra columns are kept in the {NOTES_FIELD[target].field} of each saved row.
            </p>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('source')}>
                Back
              </Button>
              <Button
                disabled={!preview.length}
                onClick={() => {
                  setRows(preview)
                  setStep('review')
                }}
              >
                Review {preview.length} rows
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <SpreadsheetGrid<ImportRow>
              label={`${TARGET_LABEL[target]} to save`}
              columns={gridColumns}
              rows={rows}
              onChange={setRows}
              newRow={blankRow}
              getRowKey={(r) => r._key}
              height={400}
              rowWarning={(r) => {
                const check = byKey.get(r._key)
                return [...(check?.errors ?? []), ...(check?.warnings ?? [])].join(' · ') || null
              }}
            />
            <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
              <div className="space-y-1">
                <p>
                  <span className="font-medium">{rows.length} rows</span>
                  {total > 0 && ` · ${formatPeso(total)}`}
                  {flagged > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {flagged} with notes (hover the row number)
                    </span>
                  )}
                </p>
                {problems.length > 0 && (
                  <ul className="text-destructive text-xs">
                    {problems.slice(0, 4).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                    {problems.length > 4 && <li>and {problems.length - 4} more</li>}
                  </ul>
                )}
                {plan && plan.rows.length > 0 && (
                  <SelectNative
                    className="h-8 w-72"
                    aria-label="Existing rows"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'add' | 'replace')}
                  >
                    <option value="add">Add to the {plan.rows.length} existing rows</option>
                    <option value="replace">Replace the {plan.rows.length} existing rows</option>
                  </SelectNative>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(method === 'manual' ? 'source' : 'columns')}
                >
                  Back (discards edits)
                </Button>
                <Button
                  disabled={!rows.length || problems.length > 0 || commit.isPending}
                  onClick={() => void proceed()}
                >
                  {commit.isPending && <Loader2Icon className="animate-spin" />} Proceed and save
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Button that opens the import dialog. */
export function ImportButton(props: Omit<ImportDialogProps, 'onClose'> & { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const { disabled, ...dialog } = props
  if (!props.programs.length) return null
  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <FileSpreadsheetIcon /> Add data
      </Button>
      {open && <ImportDialog {...dialog} onClose={() => setOpen(false)} />}
    </>
  )
}
