import { createContext, useContext } from 'react'
import type { FiscalYearRow, ProgramRow } from '@/types/database'

/** "all" is only available to superadmins. */
export type ProgramFilter = string | 'all'

export interface WorkspaceContextValue {
  fiscalYears: FiscalYearRow[]
  fiscalYear: FiscalYearRow | null
  setFiscalYearId: (id: string) => void
  /** Programs the user can pick from. */
  programs: ProgramRow[]
  programFilter: ProgramFilter
  setProgramFilter: (id: ProgramFilter) => void
  /** Program ids the current filter covers (convenience for queries). */
  selectedProgramIds: string[]
  /** False for admins/staff with a single program: the selector is locked. */
  canChangeProgram: boolean
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}
