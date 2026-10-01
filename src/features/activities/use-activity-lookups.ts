import { useMemo } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { useMasterList } from '@/features/settings/master-lists/api'
import { useUsers } from '@/features/users/api'

/** Labels for ids shown on activity pages (categories, units, fund sources, people). */
export function useActivityLookups() {
  const { programs } = useAuth()
  const { data: categories = [] } = useMasterList('activity_categories')
  const { data: units = [] } = useMasterList('units')
  const { data: funds = [] } = useMasterList('fund_sources')
  const { data: people = [] } = useUsers()

  return useMemo(() => {
    const category = new Map(categories.map((c) => [c.id, c]))
    const unit = new Map(units.map((u) => [u.id, u]))
    const fund = new Map(funds.map((f) => [f.id, f]))
    const person = new Map(people.map((p) => [p.id, p]))
    const program = new Map(programs.map((p) => [p.id, p]))
    return {
      categories,
      units,
      funds,
      people,
      program,
      name: {
        category: (id: string | null) => (id ? String(category.get(id)?.name ?? '') : ''),
        unit: (id: string | null) =>
          id ? String(unit.get(id)?.abbreviation ?? unit.get(id)?.name ?? '') : '',
        fund: (id: string | null) => (id ? String(fund.get(id)?.name ?? '') : ''),
        person: (id: string | null) => (id ? (person.get(id)?.full_name ?? '') : ''),
        program: (id: string | null) => (id ? (program.get(id)?.code ?? '') : ''),
      },
      /** Active people who belong to a program (for "responsible person" pickers). */
      membersOf: (programId: string) =>
        people.filter(
          (p) => p.is_active && (p.program_ids.includes(programId) || p.role === 'superadmin'),
        ),
    }
  }, [categories, units, funds, people, programs])
}
