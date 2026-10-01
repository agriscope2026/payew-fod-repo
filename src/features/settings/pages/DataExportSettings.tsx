import type { SupabaseClient } from '@supabase/supabase-js'
import { DatabaseBackupIcon, Loader2Icon, ShieldAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { downloadFile, timestampSlug } from '@/lib/export'
import { errorMessage, supabase } from '@/lib/supabase'

// Tables included in the configuration export. Later phases append their tables here.
const TABLES = [
  'programs',
  'fiscal_years',
  'program_memberships',
  'profiles',
  'provinces',
  'municipalities',
  'barangays',
  'fund_sources',
  'expense_classes',
  'uacs_codes',
  'commodities',
  'units',
  'activity_categories',
  'beneficiary_types',
  'document_types',
  'attachments',
  'app_settings',
] as const

const db = supabase as unknown as SupabaseClient

async function fetchAll(table: string) {
  const pageSize = 1000
  const rows: unknown[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

export default function DataExportSettings() {
  const [busy, setBusy] = useState(false)

  const exportJson = async () => {
    setBusy(true)
    try {
      const entries = await Promise.all(TABLES.map(async (t) => [t, await fetchAll(t)] as const))
      const payload = {
        exported_at: new Date().toISOString(),
        app: 'PAYEW',
        tables: Object.fromEntries(entries),
      }
      downloadFile(
        JSON.stringify(payload, null, 2),
        `payew-export-${timestampSlug()}.json`,
        'application/json',
      )
      toast.success('Export downloaded')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackupIcon className="text-primary size-5" /> Configuration export
          </CardTitle>
          <CardDescription>
            Downloads programs, fiscal years, users (profiles, no passwords), master lists and
            settings as a JSON file. Activity, finance and other module data will be added to this
            export as those modules are built.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportJson} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            Download JSON export
          </Button>
        </CardContent>
      </Card>

      <Card className="border-warning/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="size-5 text-[oklch(0.6_0.14_70)]" /> Full database backups
          </CardTitle>
          <CardDescription>
            This export is for reference and migration. It is not a disaster-recovery backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            For real backups, use Supabase's daily backups (Pro plan) or Point-in-Time Recovery.
          </p>
          <p>
            Or schedule <code className="bg-muted rounded px-1">supabase db dump</code> from a
            trusted machine. The export file contains personal data: store it securely.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
