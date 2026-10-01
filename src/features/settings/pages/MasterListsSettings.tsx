import { NavLink, Navigate, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { MASTER_LISTS, MASTER_LIST_BY_KEY, type MasterListKey } from '../master-lists/config'
import { MasterListEditor } from '../master-lists/MasterListEditor'

const GROUPS = [
  'Locations',
  'Finance',
  'Procurement',
  'Programs & Beneficiaries',
  'Documents',
] as const

export default function MasterListsSettings() {
  const { '*': rest } = useParams()
  const key = rest?.split('/')[0] as MasterListKey | undefined
  const def = key ? MASTER_LIST_BY_KEY[key] : undefined

  if (!def) return <Navigate to={`/settings/master-lists/${MASTER_LISTS[0].key}`} replace />

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Master lists" className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="text-muted-foreground mb-1 px-3 text-[11px] font-semibold tracking-wider uppercase">
              {group}
            </p>
            <ul className="flex flex-wrap gap-1 lg:block lg:space-y-0.5">
              {MASTER_LISTS.filter((l) => l.group === group).map((l) => (
                <li key={l.key}>
                  <NavLink
                    to={`/settings/master-lists/${l.key}`}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-md px-3 py-1.5 text-sm transition-colors',
                        isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent',
                      )
                    }
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <section className="min-w-0 space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{def.label}</h2>
          <p className="text-muted-foreground text-sm">{def.description}</p>
        </div>
        {/* key resets local state (filters, dialogs) when switching lists */}
        <MasterListEditor
          key={def.key}
          def={def}
          scope={def.key === 'activity_categories' ? { programId: null } : {}}
        />
      </section>
    </div>
  )
}
