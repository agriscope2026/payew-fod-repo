import { AlarmClockIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CommentsPanel } from '@/features/discussion/components/CommentsPanel'
import { NotesPanel } from '@/features/discussion/components/NotesPanel'
import { useEntityDirectives } from '@/features/directives/api'
import { DirectiveList } from '@/features/directives/components/DirectiveList'
import { IssueDirectiveDialog } from '@/features/directives/components/IssueDirectiveDialog'
import { OverdueNoticeDialog } from '@/features/directives/components/OverdueNoticeDialog'
import type { ActivityView } from '@/types/database'

/** Comments, directives/overdue notices and notes for one activity. */
export function DiscussionTab({
  activity,
  canManage,
  members,
  personName,
}: {
  activity: ActivityView
  canManage: boolean
  members: { id: string; full_name: string }[]
  personName: (id: string | null) => string
}) {
  const { data: directives = [] } = useEntityDirectives('activity', activity.id)
  const [composing, setComposing] = useState(false)
  const [notice, setNotice] = useState(false)
  const open = activity.status === 'not_started' || activity.status === 'ongoing'
  const late = open && (activity.is_overdue || activity.stage_overdue)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
          <CardDescription>
            Visible to everyone in the program. Type @ to mention a colleague; they get a
            notification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommentsPanel
            entityType="activity"
            entityId={activity.id}
            people={members}
            personName={personName}
            canModerate={canManage}
            canComment={!activity.deleted_at}
          />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Directives & notices</CardTitle>
            {canManage && !activity.deleted_at && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setComposing(true)}>
                  <PlusIcon /> Directive
                </Button>
                {late && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive"
                    onClick={() => setNotice(true)}
                  >
                    <AlarmClockIcon /> Overdue notice
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {directives.length ? (
              <DirectiveList directives={directives} showEntity={false} dense />
            ) : (
              <p className="text-muted-foreground text-sm">None for this activity.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
            <CardDescription>Private to you, or shared with the program.</CardDescription>
          </CardHeader>
          <CardContent>
            <NotesPanel
              entityType="activity"
              entityId={activity.id}
              personName={personName}
              canModerate={canManage}
            />
          </CardContent>
        </Card>
      </div>

      {composing && (
        <IssueDirectiveDialog
          onClose={() => setComposing(false)}
          linked={{
            type: 'activity',
            id: activity.id,
            programId: activity.program_id,
            label: `${activity.code} · ${activity.title}`,
          }}
        />
      )}
      {notice && <OverdueNoticeDialog activity={activity} onClose={() => setNotice(false)} />}
    </div>
  )
}
