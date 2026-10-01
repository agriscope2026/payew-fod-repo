import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { ProgramPicker } from '../components/ProgramPicker'
import { MASTER_LIST_BY_KEY } from '../master-lists/config'
import { MasterListEditor } from '../master-lists/MasterListEditor'

const def = MASTER_LIST_BY_KEY.activity_categories

/** Program admin: global categories (read-only) plus the program's own categories. */
export default function ProgramCategoriesSettings() {
  const { programs, profile } = useAuth()
  const [programId, setProgramId] = useState(profile?.program_id ?? programs[0]?.id ?? '')
  const program = programs.find((p) => p.id === programId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Categories group activities in reports and the dashboard. Add categories specific to{' '}
          {program?.code ?? 'your program'}; DA-wide categories are managed by the FOD superadmin.
        </p>
        <ProgramPicker programs={programs} value={programId} onChange={setProgramId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{program?.code} categories</CardTitle>
          <CardDescription>Only available to {program?.code} activities.</CardDescription>
        </CardHeader>
        <CardContent>
          {programId && <MasterListEditor key={programId} def={def} scope={{ programId }} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DA-wide categories</CardTitle>
          <CardDescription>Available to every program (read-only here).</CardDescription>
        </CardHeader>
        <CardContent>
          <MasterListEditor def={def} scope={{ programId: null }} readOnly />
        </CardContent>
      </Card>
    </div>
  )
}
