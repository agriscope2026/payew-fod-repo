import {
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  ListOrderedIcon,
  Loader2Icon,
  SaveIcon,
  Table2Icon,
  UploadIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canWriteProgram } from '@/features/auth/permissions'
import { formatDate, formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { FiscalYearRow } from '@/types/database'
import { useActivities } from '@/features/activities/api'
import { ActivityDialog } from '@/features/activities/components/ActivityDialog'
import { useActivityPhysical } from '@/features/activities/physical'
import { useActivityLookups } from '@/features/activities/use-activity-lookups'
import { formatPeso } from '@/lib/format'
import type { ActivityView } from '@/types/database'
import {
  loadVersion,
  useFinanceSheets,
  useSheetMutations,
  useSheetVersions,
  useSyncWfpActivities,
} from '../api'
import {
  createEvaluator,
  SHEET_NAME,
  SHEET_TITLE,
  type Evaluator,
  type Range,
  type Sheet,
  type SheetKind,
} from '../model'
import { matchesTemplate, sheetFromTemplate, templateFor } from '../templates'
import { renumberWfp } from '../numbering'
import {
  OWNED,
  REFLECT_KINDS,
  reflectInto,
  reflectItems,
  wfpLines,
  type ReflectKind,
} from '../reflect'
import { headerRowCount, wfpActivities, wfpOutline } from '../wfp'
import { downloadXlsx } from '../xlsx-io'
import { AddCardDialog } from './AddCardDialog'
import { CardView } from './CardView'
import { DocumentView } from './DocumentView'
import { SheetEditor } from './SheetEditor'
import { UploadDialog } from './UploadDialog'
import { WfpLink } from './WfpLink'

const outlineOfWfp = (sheet: Sheet, evaluator: Evaluator) => wfpOutline(sheet, 'WFP', evaluator)
const TOTAL_LABEL = /^s*(grands+|sub-?s*)?total\b/i

/** One finance sheet of a program and year: edit, upload, finalize, export. */
export function FinanceSheetView({
  program,
  fiscalYear,
  kind,
}: {
  program: { id: string; code: string; name: string }
  fiscalYear: FiscalYearRow
  kind: SheetKind
}) {
  const { profile, programs } = useAuth()
  const sheets = useFinanceSheets([program.id], fiscalYear.id)
  const mutations = useSheetMutations()
  const [working, setWorking] = useState<Sheet | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [card, setCard] = useState<{ range: Range; evaluator: Evaluator } | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [view, setView] = useState<'sheet' | 'cards' | 'document'>('sheet')
  const [openActivity, setOpenActivity] = useState<ActivityView | null>(null)
  const sync = useSyncWfpActivities()
  // The Activities side of WFP rows: only loaded on the WFP tab.
  const wfpScope = kind === 'WFP' ? [program.id] : []
  const { data: activities = [] } = useActivities({
    programIds: wfpScope,
    fiscalYearId: fiscalYear.id,
  })
  const { data: physical } = useActivityPhysical(wfpScope, fiscalYear.id)
  const lookups = useActivityLookups()

  const loaded = sheets.data?.find((s) => s.meta.kind === kind)
  const isDraft = !!loaded?.draft
  const base = loaded ? (loaded.draft ?? loaded.data) : null
  const sheet = working ?? base
  const dirty = working !== null
  const name = SHEET_NAME[kind]
  const canWrite =
    canWriteProgram(
      profile,
      programs.map((p) => p.id),
      program.id,
    ) && fiscalYear.status !== 'locked'

  const others = useMemo(
    () =>
      new Map(
        (sheets.data ?? [])
          .filter((s) => s.meta.kind !== kind)
          .map((s) => [SHEET_NAME[s.meta.kind as SheetKind], s.data]),
      ),
    [sheets.data, kind],
  )

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(`Leave without saving your changes to the ${name}?`)) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker, name])

  if (sheets.isError) return <ErrorState onRetry={() => void sheets.refetch()} />
  if (sheets.isPending) return <Skeleton className="h-[520px]" />

  const start = async (from: Sheet, templateKey: string | null) => {
    const id = await mutations.create.mutateAsync({
      programId: program.id,
      fiscalYearId: fiscalYear.id,
      kind,
      sheet: from,
      templateKey,
    })
    return id
  }

  /** The empty template as a file to fill in and upload back. */
  const downloadTemplate = () => {
    const template = sheetFromTemplate(kind)
    void downloadXlsx({
      sheet: template,
      sheetName: name,
      evaluator: createEvaluator({ sheets: new Map([[name, template]]) }),
      title: `${fiscalYear.label} ${SHEET_TITLE[kind]}`,
      subtitle: `${program.code} — ${program.name} · template`,
      fileName: `PAYEW-${name}-template.xlsx`,
    }).catch((e) => toast.error(errorMessage(e, 'The file could not be created.')))
  }

  const upload = async (uploaded: Sheet, source: string) => {
    const id = loaded?.meta.id ?? (await start(sheetFromTemplate(kind), templateFor(kind).key))
    await mutations.saveDraft.mutateAsync({ id, draft: uploaded, source })
    setWorking(null)
    setEditorKey((k) => k + 1)
    toast.success('Draft opened. Clean up the table, then choose Finalize.')
  }

  if (!loaded || !sheet) {
    return (
      <>
        <EmptyState
          icon={FileSpreadsheetIcon}
          title={`No ${name} yet`}
          description={
            canWrite
              ? `Start from the ${templateFor(kind).name} template, or upload your own file.`
              : 'Someone who can edit this program’s records needs to start it.'
          }
          action={
            canWrite && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  disabled={mutations.create.isPending}
                  onClick={() =>
                    void start(sheetFromTemplate(kind), templateFor(kind).key).catch((e) =>
                      toast.error(errorMessage(e)),
                    )
                  }
                >
                  {mutations.create.isPending && <Loader2Icon className="animate-spin" />} Start
                  from template
                </Button>
                <Button variant="outline" onClick={() => setUploadOpen(true)}>
                  <UploadIcon /> Upload a file
                </Button>
              </div>
            )
          }
        />
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          kind={kind}
          sheetLabel={name}
          onUpload={upload}
          onDownloadTemplate={downloadTemplate}
        />
      </>
    )
  }

  const meta = loaded.meta
  const evaluatorFor = (s: Sheet) => createEvaluator({ sheets: new Map([...others, [name, s]]) })

  /** Creates or updates the program's activities from the saved WFP. */
  const syncActivities = async (saved: Sheet, quiet = false) => {
    if (kind !== 'WFP') return
    try {
      const items = wfpActivities(saved, name, evaluatorFor(saved))
      const r = await sync.mutateAsync({ sheetId: meta.id, items })
      if (!quiet || r.created || r.removed)
        toast.success(
          `Activities updated: ${r.created} added, ${r.updated} changed${r.removed ? `, ${r.removed} no longer in the WFP` : ''}`,
        )
    } catch (e) {
      toast.error(`The sheet was saved, but the activities were not updated: ${errorMessage(e)}`)
    }
    await reflectOthers(saved)
  }

  /** Carries WFP rows into the ORS and DV registers, the PPMP and the APP. */
  const reflectOthers = async (saved: Sheet) => {
    const lines = wfpLines(saved, name, evaluatorFor(saved))
    const done: string[] = []
    const skipped: string[] = []
    for (const target of REFLECT_KINDS) {
      const existing = sheets.data?.find((s) => s.meta.kind === target)
      const items = reflectItems(target, lines)
      if (!existing && !items.length) continue
      const result = reflectInto(target, existing?.data ?? sheetFromTemplate(target), items)
      if (!result) {
        skipped.push(SHEET_NAME[target])
        continue
      }
      if (!result.added && !result.updated && !result.removed) continue
      try {
        if (existing) {
          const keeps = matchesTemplate(target, result.sheet)
          await mutations.save.mutateAsync({
            id: existing.meta.id,
            version: existing.meta.version,
            sheet: result.sheet,
            isCustom: !keeps,
            templateKey: keeps ? templateFor(target).key : null,
          })
        } else {
          await mutations.create.mutateAsync({
            programId: program.id,
            fiscalYearId: fiscalYear.id,
            kind: target,
            sheet: result.sheet,
            templateKey: templateFor(target).key,
          })
        }
        done.push(
          `${SHEET_NAME[target]} (${result.added} added, ${result.updated} updated${result.removed ? `, ${result.removed} removed` : ''})`,
        )
      } catch (e) {
        toast.error(`${SHEET_NAME[target]} was not updated from the WFP: ${errorMessage(e)}`)
      }
    }
    if (done.length) toast.success(`Also updated from the WFP: ${done.join('; ')}`)
    if (skipped.length)
      toast.warning(
        `${skipped.join(', ')} no longer ${skipped.length > 1 ? 'have' : 'has'} the template’s columns, so the WFP could not fill ${skipped.length > 1 ? 'them' : 'it'}.`,
      )
  }
  const custom = isDraft || !matchesTemplate(kind, sheet)

  /** WFP numbering (phases, 1.1., a.) is put in order whenever the sheet is saved. */
  const numbered = (s: Sheet) => (kind === 'WFP' ? renumberWfp(s, name, evaluatorFor(s)) : s)

  const save = async () => {
    const draftSheet = working
    if (!draftSheet) return
    try {
      const working = numbered(draftSheet)
      if (isDraft) {
        await mutations.saveDraft.mutateAsync({ id: meta.id, draft: working })
        toast.success('Draft saved')
      } else {
        // Custom means the layout differs from the template, whatever it was before.
        const keepsTemplate = matchesTemplate(kind, working)
        await mutations.save.mutateAsync({
          id: meta.id,
          version: meta.version,
          sheet: working,
          isCustom: !keepsTemplate,
          templateKey: keepsTemplate ? templateFor(kind).key : null,
        })
        toast.success(`${name} saved`)
        void syncActivities(working, true)
      }
      setWorking(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const finalize = async () => {
    if (!window.confirm(`Make this table the ${name}? The current one stays in Version history.`))
      return
    try {
      const final = numbered(working ?? loaded.draft!)
      await mutations.finalize.mutateAsync({
        id: meta.id,
        version: meta.version,
        sheet: final,
      })
      void syncActivities(final)
      setWorking(null)
      setEditorKey((k) => k + 1)
      toast.success(`${name} finalized`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const discardDraft = async () => {
    if (!window.confirm('Discard the uploaded draft? The current sheet is not changed.')) return
    try {
      await mutations.saveDraft.mutateAsync({ id: meta.id, draft: null })
      setWorking(null)
      setEditorKey((k) => k + 1)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const exportFile = () =>
    downloadXlsx({
      sheet,
      sheetName: name,
      evaluator: evaluatorFor(sheet),
      title: `${fiscalYear.label} ${SHEET_TITLE[kind]}`,
      subtitle: `${program.code} — ${program.name} · exported ${formatDate(new Date().toISOString())}`,
      fileName: `PAYEW-${program.code}-${name}-${fiscalYear.label}.xlsx`.replace(/\s+/g, '-'),
    }).catch((e) => toast.error(errorMessage(e, 'The file could not be created.')))

  const saving =
    mutations.save.isPending || mutations.saveDraft.isPending || mutations.finalize.isPending

  const rowExtras =
    kind === 'WFP' && !isDraft
      ? (row: number, ev: Evaluator) => {
          const block = wfpActivities(sheet, name, ev).find((a) => row >= a.row && row <= a.lastRow)
          if (!block) return null
          const linkedId = [...(physical?.values() ?? [])].find(
            (p) => p.wfp_row_id === block.rowId,
          )?.activity_id
          const view = activities.find((a) => a.id === linkedId)
          return (
            <>
              <p className="font-medium">{block.title}</p>
              <p className="text-muted-foreground text-xs">
                Target {block.target ?? '—'} {block.unit ?? ''} · budget {formatPeso(block.budget)}{' '}
                · obligated {formatPeso(block.obligated)} · disbursed {formatPeso(block.disbursed)}
              </p>
              {view ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setOpenActivity(view)}
                >
                  Open activity details
                </Button>
              ) : (
                <p className="text-muted-foreground mt-1 text-xs">
                  Save the WFP to add it to the Activities page.
                </p>
              )}
            </>
          )
        }
      : undefined

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{SHEET_TITLE[kind]}</span>
        <div
          className="bg-card inline-flex rounded-md border p-0.5 print:hidden"
          role="group"
          aria-label="View"
        >
          {(
            [
              ['sheet', 'Sheet', Table2Icon],
              ['cards', 'Cards', LayoutGridIcon],
              ['document', 'Document', FileTextIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={
                view === value
                  ? 'bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs'
                  : 'hover:bg-accent inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs'
              }
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        {isDraft ? (
          <Badge variant="outline" className="border-warning/50 text-warning">
            Draft from upload
          </Badge>
        ) : custom ? (
          <Badge variant="outline">
            Custom{meta.source_name ? ` · from ${meta.source_name}` : ''}
          </Badge>
        ) : (
          <Badge variant="outline">Template · {templateFor(kind).name}</Badge>
        )}
        {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
        <span className="text-muted-foreground text-xs">
          Version {meta.version} · saved {formatDateTime(meta.updated_at)}
        </span>
      </div>

      {!isDraft && (REFLECT_KINDS as readonly string[]).includes(kind) && view === 'sheet' && (
        <p className="bg-muted/50 rounded-md border px-3 py-2 text-sm print:hidden">
          Rows from the WFP appear here when the WFP is saved. Their{' '}
          <b>{OWNED[kind as ReflectKind].join(', ').toLowerCase()}</b> follow the WFP, so change
          those there. Fill in the other columns here.
        </p>
      )}
      {isDraft && (
        <div className="border-warning/40 bg-warning/5 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <p className="flex-1">
            You are cleaning up <b>{loaded.draftSource ?? 'an uploaded table'}</b>. Remove what you
            don’t need, fix the columns and formats, then finalize it to replace the current {name}.
          </p>
          {canWrite && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void discardDraft()}
                disabled={saving}
              >
                Discard draft
              </Button>
              <Button size="sm" onClick={() => void finalize()} disabled={saving}>
                Finalize
              </Button>
            </>
          )}
        </div>
      )}

      {view === 'document' ? (
        <DocumentView
          sheet={sheet}
          sheetName={name}
          kind={kind}
          evaluator={evaluatorFor(sheet)}
          heading={`${fiscalYear.label} ${SHEET_TITLE[kind]}`}
          subheading={`${program.code} — ${program.name} · as of ${formatDate(new Date().toISOString())}`}
        />
      ) : view === 'cards' ? (
        <CardView
          sheet={sheet}
          sheetName={name}
          kind={kind}
          evaluator={evaluatorFor(sheet)}
          readOnly={!canWrite}
          dirty={dirty}
          saving={saving}
          onChange={setWorking}
          onSave={() => void save()}
          rowExtras={rowExtras}
        />
      ) : (
        <SheetEditor
          key={`${meta.id}-${editorKey}-${isDraft}`}
          sheet={sheet}
          sheetName={name}
          otherSheets={others}
          readOnly={!canWrite}
          onChange={setWorking}
          onSave={() => void save()}
          onAddCard={
            isDraft
              ? undefined
              : (range, evaluator) => {
                  if (dirty)
                    return toast.error('Save the sheet first, so the card points at saved cells.')
                  setCard({ range, evaluator })
                }
          }
          outlineOf={kind === 'WFP' ? outlineOfWfp : undefined}
          onTotalCard={
            isDraft
              ? undefined
              : (c, evaluator) => {
                  if (dirty)
                    return toast.error('Save the sheet first, so the card points at saved cells.')
                  // Use the sheet's own total cell when it has one; otherwise add up the column.
                  const header = headerRowCount(sheet)
                  const totalRow = sheet.rows.findIndex((_, r) => {
                    const label = sheet.cols
                      .map((__, k) => evaluator.value(name, r, k))
                      .find((v) => typeof v === 'string' && v.trim() !== '')
                    return (
                      typeof label === 'string' &&
                      TOTAL_LABEL.test(label) &&
                      typeof evaluator.value(name, r, c) === 'number'
                    )
                  })
                  setCard({
                    range:
                      totalRow >= 0
                        ? { r1: totalRow, c1: c, r2: totalRow, c2: c }
                        : { r1: header, c1: c, r2: sheet.rows.length - 1, c2: c },
                    evaluator,
                  })
                }
          }
          rowExtras={rowExtras}
          actions={
            <>
              {kind === 'WFP' && canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  title="Puts phases, activities, sub-activities and lettered items in order. Also done on every save."
                  onClick={() => {
                    const next = numbered(sheet)
                    if (next === sheet) return toast.info('The numbering is already in order.')
                    setWorking(next)
                    toast.success('Numbering fixed. Save to keep it.')
                  }}
                >
                  <ListOrderedIcon /> Fix numbering
                </Button>
              )}
              {kind === 'WFP' && !isDraft && (
                <WfpLink
                  sheet={sheet}
                  activityCount={wfpActivities(sheet, name, evaluatorFor(sheet)).length}
                  readOnly={!canWrite}
                  syncing={sync.isPending}
                  canSync={canWrite && !dirty}
                  onChange={setWorking}
                  onSync={() => void syncActivities(sheet)}
                />
              )}
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadOpen(true)}
                  disabled={dirty}
                >
                  <UploadIcon /> Upload
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void exportFile()}>
                <DownloadIcon /> Export
              </Button>
              {!isDraft && (
                <VersionHistory
                  sheetId={meta.id}
                  disabled={!canWrite}
                  onRestore={(restored, version) => {
                    setWorking(restored)
                    toast.success(`Version ${version} loaded. Save to keep it.`)
                  }}
                  onTemplate={() => {
                    if (
                      !window.confirm(
                        `Replace the ${name} with an empty ${templateFor(kind).name} template?`,
                      )
                    )
                      return
                    setWorking(sheetFromTemplate(kind))
                    toast.success('Template loaded. Save to keep it.')
                  }}
                />
              )}
              {!isDraft && (
                <Button
                  size="sm"
                  variant="outline"
                  title="Select cells, then show them on the dashboard"
                  onClick={() =>
                    toast.info('Select the cells, then right-click and choose “Show on dashboard”.')
                  }
                >
                  <LayoutDashboardIcon /> Dashboard card
                </Button>
              )}
              {canWrite && (
                <>
                  {dirty && (
                    <Button size="sm" variant="ghost" onClick={() => setWorking(null)}>
                      Discard
                    </Button>
                  )}
                  <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
                    {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
                  </Button>
                </>
              )}
            </>
          }
        />
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        kind={kind}
        sheetLabel={name}
        onUpload={upload}
        onDownloadTemplate={downloadTemplate}
      />
      {openActivity && (
        <ActivityDialog
          activity={openActivity}
          physical={physical?.get(openActivity.id)}
          unitName={
            lookups.name.unit(openActivity.unit_id) ||
            physical?.get(openActivity.id)?.unit_label ||
            ''
          }
          canEdit={canWrite}
          onClose={() => setOpenActivity(null)}
        />
      )}
      {card && (
        <AddCardDialog
          open
          onOpenChange={(o) => !o && setCard(null)}
          sheet={sheet}
          sheetName={name}
          sheetId={meta.id}
          programId={program.id}
          fiscalYearId={fiscalYear.id}
          evaluator={card.evaluator}
          range={card.range}
        />
      )}
    </div>
  )
}

function VersionHistory({
  sheetId,
  disabled,
  onRestore,
  onTemplate,
}: {
  sheetId: string
  disabled: boolean
  onRestore: (sheet: Sheet, version: number) => void
  onTemplate: () => void
}) {
  const [open, setOpen] = useState(false)
  const { data: versions, isPending } = useSheetVersions(open ? sheetId : null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <HistoryIcon /> History
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-80 w-72 overflow-y-auto p-2">
        <p className="text-muted-foreground px-1 pb-1 text-xs">Earlier saved versions (last 30)</p>
        {isPending ? (
          <Skeleton className="h-16" />
        ) : !versions?.length ? (
          <p className="px-1 py-2 text-sm">No earlier versions yet.</p>
        ) : (
          versions.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={disabled}
              className="hover:bg-accent flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm disabled:opacity-60"
              onClick={() =>
                void loadVersion(v.id)
                  .then((s) => {
                    onRestore(s, v.version)
                    setOpen(false)
                  })
                  .catch((e) => toast.error(errorMessage(e)))
              }
            >
              <span>Version {v.version}</span>
              <span className="text-muted-foreground text-xs">{formatDateTime(v.saved_at)}</span>
            </button>
          ))
        )}
        {!disabled && (
          <button
            type="button"
            className="hover:bg-accent mt-1 w-full rounded border-t px-2 py-2 text-left text-sm"
            onClick={() => {
              setOpen(false)
              onTemplate()
            }}
          >
            Start over from the template
            <span className="text-muted-foreground block text-xs">
              The current sheet stays in this history.
            </span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
