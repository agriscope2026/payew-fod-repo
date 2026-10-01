import { Loader2Icon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/ErrorState'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { useAppSettings, useSaveSetting, type AppSettings, type SettingInput } from '../api'

export default function SystemSettings() {
  const { data, isPending, isError, refetch } = useAppSettings()

  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <MaintenanceCard initial={data.maintenance_banner ?? { enabled: false, message: '' }} />
      <ValidationCard initial={data.validation_strictness ?? 'warn'} />
      <OverdueTemplateCard
        initial={
          data.overdue_notice_template ?? {
            title: 'Overdue activity: {title}',
            body: 'Activity {title} was due on {date} ({n} days overdue). Please provide a status update and revised target date.',
            response_days: 5,
          }
        }
      />
      <RemindersCard
        initial={
          data.reminders ?? {
            stage_due_days: 2,
            directive_due_days: 1,
            activity_escalation_days: [1, 7, 30],
            directive_escalation_days: [1, 3, 7],
          }
        }
      />
      <ThresholdsCard
        initial={
          data.dashboard_thresholds ?? {
            utilization: { green: 80, amber: 50 },
            obligation_rate: { green: 85, amber: 60 },
            disbursement_rate: { green: 75, amber: 50 },
          }
        }
      />
      <UploadsCard
        initial={
          data.uploads ?? {
            max_mb: 25,
            allowed_extensions: ['xlsx', 'xls', 'csv', 'pdf', 'docx', 'jpg', 'jpeg', 'png'],
            presign_ttl_seconds: 600,
          }
        }
      />
    </div>
  )
}

function SettingCard({
  title,
  description,
  children,
  onSave,
  saving,
  error,
}: {
  title: string
  description: string
  children: ReactNode
  onSave: () => void
  saving: boolean
  error?: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2Icon className="animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  )
}

function useSaver<K extends keyof AppSettings>(key: K, label: string) {
  const save = useSaveSetting()
  return {
    saving: save.isPending,
    run: async (value: AppSettings[K]) => {
      try {
        await save.mutateAsync({ key, value } as SettingInput)
        toast.success(`${label} saved`)
      } catch (err) {
        toast.error(errorMessage(err))
      }
    },
  }
}

function MaintenanceCard({ initial }: { initial: AppSettings['maintenance_banner'] }) {
  const [value, setValue] = useState(initial)
  const saver = useSaver('maintenance_banner', 'Maintenance banner')
  return (
    <SettingCard
      title="Maintenance banner"
      description="A notice shown at the top of every page, e.g. scheduled downtime."
      saving={saver.saving}
      error={value.enabled && !value.message.trim() ? 'Enter a message to show the banner.' : null}
      onSave={() => void saver.run({ ...value, message: value.message.trim() })}
    >
      <label className="flex items-center gap-3 text-sm">
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) => setValue({ ...value, enabled })}
        />
        Show banner
      </label>
      <FormField id="banner-message" label="Message">
        <Input
          id="banner-message"
          value={value.message}
          maxLength={200}
          placeholder="e.g. PAYEW will be offline Saturday 8–10 PM for maintenance."
          onChange={(e) => setValue({ ...value, message: e.target.value })}
        />
      </FormField>
    </SettingCard>
  )
}

function ValidationCard({ initial }: { initial: AppSettings['validation_strictness'] }) {
  const [value, setValue] = useState(initial)
  const saver = useSaver('validation_strictness', 'Validation rule')
  return (
    <SettingCard
      title="Finance validation"
      description="What happens when an obligation exceeds its allotment, or a disbursement exceeds its obligation."
      saving={saver.saving}
      onSave={() => void saver.run(value)}
    >
      <div className="space-y-2">
        {(
          [
            ['warn', 'Warn', 'Show a warning but allow saving (useful during encoding catch-up).'],
            ['block', 'Block', 'Refuse to save until amounts are within limits.'],
          ] as const
        ).map(([v, label, hint]) => (
          <label
            key={v}
            className="has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-md border p-3"
          >
            <input
              type="radio"
              name="validation"
              className="mt-1"
              checked={value === v}
              onChange={() => setValue(v)}
            />
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="text-muted-foreground block text-xs">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </SettingCard>
  )
}

function OverdueTemplateCard({ initial }: { initial: AppSettings['overdue_notice_template'] }) {
  const [value, setValue] = useState(initial)
  const saver = useSaver('overdue_notice_template', 'Overdue notice template')
  const fill = (t: string) =>
    t
      .replaceAll('{title}', 'Distribution of Arabica coffee seedlings')
      .replaceAll('{code}', 'HVC-2026-0007')
      .replaceAll('{stage}', 'Procurement')
      .replaceAll('{date}', formatDate('2026-09-15'))
      .replaceAll('{n}', '16')
  const invalid = !value.title.trim() || !value.body.trim() || value.response_days < 1
  return (
    <SettingCard
      title="Overdue notice template"
      description="Pre-fills the “Send Overdue Notice” composer. Placeholders: {title}, {code}, {stage}, {date}, {n} (days overdue)."
      saving={saver.saving}
      error={invalid ? 'Title, body and a response window of at least 1 day are required.' : null}
      onSave={() => !invalid && void saver.run(value)}
    >
      <FormField id="tpl-title" label="Title">
        <Input
          id="tpl-title"
          value={value.title}
          onChange={(e) => setValue({ ...value, title: e.target.value })}
        />
      </FormField>
      <FormField id="tpl-body" label="Message">
        <Textarea
          id="tpl-body"
          rows={3}
          value={value.body}
          onChange={(e) => setValue({ ...value, body: e.target.value })}
        />
      </FormField>
      <FormField id="tpl-days" label="Response due after (days)">
        <Input
          id="tpl-days"
          type="number"
          min={1}
          max={60}
          className="w-28"
          value={value.response_days}
          onChange={(e) => setValue({ ...value, response_days: Number(e.target.value) })}
        />
      </FormField>
      <div className="bg-muted/40 rounded-md border border-dashed p-3 text-sm">
        <p className="text-muted-foreground mb-1 text-xs font-medium">Preview</p>
        <p className="font-medium">{fill(value.title)}</p>
        <p>{fill(value.body)}</p>
      </div>
    </SettingCard>
  )
}

function RemindersCard({ initial }: { initial: AppSettings['reminders'] }) {
  const [value, setValue] = useState(initial)
  const saver = useSaver('reminders', 'Reminder settings')
  const levels = (k: 'activity_escalation_days' | 'directive_escalation_days') => (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <FormField key={i} id={`${k}-${i}`} label={`Level ${i + 1} after`}>
          <Input
            id={`${k}-${i}`}
            type="number"
            min={1}
            max={365}
            value={value[k][i] ?? ''}
            onChange={(e) => {
              const next = [...value[k]]
              next[i] = Number(e.target.value)
              setValue({ ...value, [k]: next })
            }}
          />
        </FormField>
      ))}
    </div>
  )
  const ascending = (xs: number[]) =>
    xs.length === 3 && xs.every((x, i) => x >= 1 && (i === 0 || x > xs[i - 1]))
  const invalid =
    value.stage_due_days < 1 ||
    value.directive_due_days < 1 ||
    !ascending(value.activity_escalation_days) ||
    !ascending(value.directive_escalation_days)
  return (
    <SettingCard
      title="Reminders & escalation"
      description="The daily 7:00 AM sweep sends deadline reminders, then escalates overdue items: level 1 to the person responsible, level 2 adds program admins, level 3 adds the FOD superadmin."
      saving={saver.saving}
      error={invalid ? 'Use whole days of at least 1; escalation levels must increase.' : null}
      onSave={() => !invalid && void saver.run(value)}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField id="rem-stage" label="Stage/checklist reminder (days before)">
          <Input
            id="rem-stage"
            type="number"
            min={1}
            max={30}
            value={value.stage_due_days}
            onChange={(e) => setValue({ ...value, stage_due_days: Number(e.target.value) })}
          />
        </FormField>
        <FormField id="rem-dir" label="Directive reminder (days before)">
          <Input
            id="rem-dir"
            type="number"
            min={1}
            max={30}
            value={value.directive_due_days}
            onChange={(e) => setValue({ ...value, directive_due_days: Number(e.target.value) })}
          />
        </FormField>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Overdue activities — days past due date</p>
        {levels('activity_escalation_days')}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Unanswered directives — days past response date</p>
        {levels('directive_escalation_days')}
      </div>
    </SettingCard>
  )
}

const THRESHOLD_LABELS: Record<keyof AppSettings['dashboard_thresholds'], string> = {
  utilization: 'Budget utilization',
  obligation_rate: 'Obligation rate',
  disbursement_rate: 'Disbursement rate',
}

function ThresholdsCard({ initial }: { initial: AppSettings['dashboard_thresholds'] }) {
  const [value, setValue] = useState(initial)
  const saver = useSaver('dashboard_thresholds', 'Dashboard thresholds')
  const keys = Object.keys(THRESHOLD_LABELS) as (keyof typeof THRESHOLD_LABELS)[]
  const invalid = keys.some(
    (k) => !(value[k].amber >= 0 && value[k].green <= 100 && value[k].green > value[k].amber),
  )
  return (
    <SettingCard
      title="Dashboard color thresholds"
      description="Rates at or above Green show green; at or above Amber show amber; below Amber show red."
      saving={saver.saving}
      error={invalid ? 'Each Green value must be higher than its Amber value (0–100).' : null}
      onSave={() => !invalid && void saver.run(value)}
    >
      <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-3 gap-y-2 text-sm">
        <span />
        <span className="text-success text-xs font-medium">Green ≥ %</span>
        <span className="text-xs font-medium text-[oklch(0.55_0.13_70)]">Amber ≥ %</span>
        {keys.map((k) => (
          <ThresholdRow
            key={k}
            label={THRESHOLD_LABELS[k]}
            value={value[k]}
            onChange={(t) => setValue({ ...value, [k]: t })}
          />
        ))}
      </div>
    </SettingCard>
  )
}

function ThresholdRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: { green: number; amber: number }
  onChange: (v: { green: number; amber: number }) => void
}) {
  return (
    <>
      <span>{label}</span>
      <Input
        type="number"
        min={0}
        max={100}
        aria-label={`${label} green threshold`}
        value={value.green}
        onChange={(e) => onChange({ ...value, green: Number(e.target.value) })}
      />
      <Input
        type="number"
        min={0}
        max={100}
        aria-label={`${label} amber threshold`}
        value={value.amber}
        onChange={(e) => onChange({ ...value, amber: Number(e.target.value) })}
      />
    </>
  )
}

function UploadsCard({ initial }: { initial: AppSettings['uploads'] }) {
  const [value, setValue] = useState(initial)
  const [extensions, setExtensions] = useState(initial.allowed_extensions.join(', '))
  const saver = useSaver('uploads', 'Upload limits')
  const invalid =
    value.max_mb < 1 ||
    value.max_mb > 25 ||
    value.presign_ttl_seconds < 60 ||
    value.presign_ttl_seconds > 600
  return (
    <SettingCard
      title="File uploads"
      description="Limits enforced by the upload Edge Function (Phase 3). Hard caps: 25 MB per file, 10-minute links."
      saving={saver.saving}
      error={invalid ? 'Max size must be 1–25 MB and link expiry 60–600 seconds.' : null}
      onSave={() =>
        !invalid &&
        void saver.run({
          ...value,
          allowed_extensions: extensions
            .split(',')
            .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
            .filter(Boolean),
        })
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField id="max-mb" label="Max file size (MB)">
          <Input
            id="max-mb"
            type="number"
            min={1}
            max={25}
            value={value.max_mb}
            onChange={(e) => setValue({ ...value, max_mb: Number(e.target.value) })}
          />
        </FormField>
        <FormField id="ttl" label="Link expiry (seconds)">
          <Input
            id="ttl"
            type="number"
            min={60}
            max={600}
            value={value.presign_ttl_seconds}
            onChange={(e) => setValue({ ...value, presign_ttl_seconds: Number(e.target.value) })}
          />
        </FormField>
      </div>
      <FormField id="exts" label="Allowed file types" hint="Comma-separated extensions">
        <Input id="exts" value={extensions} onChange={(e) => setExtensions(e.target.value)} />
      </FormField>
    </SettingCard>
  )
}
