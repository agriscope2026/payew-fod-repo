import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRightIcon, Loader2Icon, UsersIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/api'
import { errorMessage } from '@/lib/supabase'
import { useSaveProgram } from '../api'
import { ProgramFields } from '../components/ProgramFields'
import { ProgramPicker } from '../components/ProgramPicker'
import { programDefaults, programSchema, type ProgramValues } from '../program-schema'

/** Program admin: edit the profile of a program they manage (code is superadmin-only). */
export default function ProgramProfileSettings() {
  const { programs, profile } = useAuth()
  const { data: users = [] } = useUsers()
  const [programId, setProgramId] = useState(profile?.program_id ?? programs[0]?.id ?? '')
  const program = programs.find((p) => p.id === programId) ?? null
  const save = useSaveProgram()

  const form = useForm<ProgramValues>({
    resolver: zodResolver(programSchema),
    defaultValues: programDefaults(program),
  })
  const color = useWatch({ control: form.control, name: 'color' })

  useEffect(() => {
    form.reset(programDefaults(program))
  }, [program, form])

  const staff = users.filter((u) => u.role === 'program_staff' && u.program_ids.includes(programId))
  const activeStaff = staff.filter((u) => u.is_active).length

  const onSubmit = form.handleSubmit(async ({ name, description, color }) => {
    if (!program) return
    try {
      await save.mutateAsync({
        id: program.id,
        input: { name, description: description || null, color },
      })
      toast.success('Program profile saved')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  if (!program) return null

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Program profile</CardTitle>
            <CardDescription>Shown in reports, filters and the dashboard.</CardDescription>
          </div>
          <ProgramPicker programs={programs} value={programId} onChange={setProgramId} />
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <ProgramFields form={form} color={color} codeLocked />
            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
              {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="text-primary size-5" /> Staff
          </CardTitle>
          <CardDescription>
            {activeStaff} active of {staff.length} staff account{staff.length === 1 ? '' : 's'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link to="/users">
              Manage staff <ArrowRightIcon />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
