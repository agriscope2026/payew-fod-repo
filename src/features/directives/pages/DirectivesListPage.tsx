import { PlusIcon, ScrollTextIcon } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { cn } from '@/lib/utils'
import type { DirectiveKind, DirectiveStatus } from '@/types/database'
import { useDirectives, type DirectiveBox } from '../api'
import { DirectiveList } from '../components/DirectiveList'
import { IssueDirectiveDialog } from '../components/IssueDirectiveDialog'

export default function DirectivesListPage() {
  const { profile, programs } = useAuth()
  const programIds = programs.map((p) => p.id)
  const canIssue = programs.some((p) => canManageProgram(profile, programIds, p.id))

  const [box, setBox] = useState<DirectiveBox>('inbox')
  const [status, setStatus] = useState<DirectiveStatus | ''>('open')
  const [kind, setKind] = useState<DirectiveKind | ''>('')
  const [programId, setProgramId] = useState('')
  const [composing, setComposing] = useState(false)
  const { data, isPending, isError, refetch } = useDirectives({ box, status, kind, programId })

  const boxes: [DirectiveBox, string][] = canIssue
    ? [
        ['inbox', 'For me'],
        ['issued', 'Issued by me'],
        ['all', 'All in my programs'],
      ]
    : [['inbox', 'For me']]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Directives"
        description="Instructions and overdue notices that need acknowledgement and a response."
        actions={
          canIssue && (
            <Button onClick={() => setComposing(true)}>
              <PlusIcon /> New directive
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {boxes.length > 1 && (
          <div
            className="bg-card inline-flex rounded-md border p-0.5"
            role="group"
            aria-label="Mailbox"
          >
            {boxes.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={box === value}
                onClick={() => setBox(value)}
                className={cn(
                  'rounded px-3 py-1 text-sm',
                  box === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <SelectNative
          aria-label="Status"
          className="w-36"
          value={status}
          onChange={(e) => setStatus(e.target.value as DirectiveStatus | '')}
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="">Any status</option>
        </SelectNative>
        <SelectNative
          aria-label="Kind"
          className="w-40"
          value={kind}
          onChange={(e) => setKind(e.target.value as DirectiveKind | '')}
        >
          <option value="">All kinds</option>
          <option value="directive">Directives</option>
          <option value="overdue_notice">Overdue notices</option>
        </SelectNative>
        {programs.length > 1 && (
          <SelectNative
            aria-label="Program"
            className="w-36"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
          >
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </SelectNative>
        )}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="space-y-4 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={ScrollTextIcon}
            title={box === 'inbox' ? 'Nothing for you' : 'No directives'}
            description={
              box === 'inbox'
                ? 'Directives and overdue notices addressed to you appear here.'
                : 'Nothing matches these filters.'
            }
          />
        ) : (
          <DirectiveList directives={data} />
        )}
      </Card>

      {composing && <IssueDirectiveDialog onClose={() => setComposing(false)} />}
    </div>
  )
}
