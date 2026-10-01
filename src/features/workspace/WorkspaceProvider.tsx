import { useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { storage } from '@/lib/utils'
import { useFiscalYears } from './api'
import {
  WorkspaceContext,
  type ProgramFilter,
  type WorkspaceContextValue,
} from './workspace-context'

const FY_KEY = 'payew-fiscal-year'
const PROGRAM_KEY = 'payew-program'

/** Global filters shared by every page: fiscal year and program scope. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { programs, isSuperadmin, profile } = useAuth()
  const { data: fiscalYears = [] } = useFiscalYears()
  const [fyId, setFyId] = useState(() => storage.get(FY_KEY))
  const [programPick, setProgramPick] = useState<ProgramFilter | null>(() =>
    storage.get(PROGRAM_KEY),
  )

  const value = useMemo<WorkspaceContextValue>(() => {
    const fiscalYear =
      fiscalYears.find((f) => f.id === fyId) ??
      fiscalYears.find((f) => f.is_current) ??
      fiscalYears[0] ??
      null

    const programIds = programs.map((p) => p.id)
    const fallback: ProgramFilter = isSuperadmin
      ? 'all'
      : (profile?.program_id ?? programIds[0] ?? 'all')
    const programFilter: ProgramFilter =
      programPick && ((programPick === 'all' && isSuperadmin) || programIds.includes(programPick))
        ? programPick
        : fallback

    return {
      fiscalYears,
      fiscalYear,
      setFiscalYearId: (id) => {
        storage.set(FY_KEY, id)
        setFyId(id)
      },
      programs,
      programFilter,
      setProgramFilter: (id) => {
        storage.set(PROGRAM_KEY, id)
        setProgramPick(id)
      },
      selectedProgramIds: programFilter === 'all' ? programIds : [programFilter],
      canChangeProgram: isSuperadmin || programs.length > 1,
    }
  }, [fiscalYears, fyId, programs, programPick, isSuperadmin, profile?.program_id])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
