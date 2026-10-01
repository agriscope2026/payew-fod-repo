import {
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  PencilIcon,
  SearchXIcon,
  Trash2Icon,
} from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { CommentsPanel } from '@/features/discussion/components/CommentsPanel'
import { NotesPanel } from '@/features/discussion/components/NotesPanel'
import { AttachmentsPanel } from '@/features/files/components/AttachmentsPanel'
import { useProfileNames, useUsers } from '@/features/users/api'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { AssistanceHistory } from '../components/AssistanceHistory'
import { useBeneficiary, useTrashBeneficiary } from '../api'
import { BeneficiaryFormDialog } from '../components/BeneficiaryFormDialog'
import { StatusBadge } from '../components/StatusBadge'
import { useBeneficiaryLookups } from '../use-lookups'

const BeneficiaryMap = lazy(() => import('../components/BeneficiaryMap'))

export default function BeneficiaryDetailPage() {
  const { id } = useParams()
  const { profile, programs, isSuperadmin } = useAuth()
  const { data: b, isPending, isError, refetch } = useBeneficiary(id)
  const { names, programById } = useBeneficiaryLookups()
  const { data: people } = useProfileNames()
  const { data: users = [] } = useUsers()
  const trash = useTrashBeneficiary()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!b) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Beneficiary not found"
        description="It may have been deleted, or the link is wrong."
        action={
          <Button asChild variant="outline">
            <Link to="/beneficiaries">Back to Beneficiaries</Link>
          </Button>
        }
      />
    )
  }

  const programIds = programs.map((p) => p.id)
  const owner = b.registered_by_program_id
  const canEdit = owner ? canWriteProgram(profile, programIds, owner) : isSuperadmin
  const canTrash = owner ? canManageProgram(profile, programIds, owner) : isSuperadmin
  const program = owner ? programById.get(owner) : null
  const personName = (uid: string | null) => (uid ? (people?.get(uid) ?? '') : '')
  const mentionable = users
    .filter((u) => u.is_active)
    .map((u) => ({ id: u.id, full_name: u.full_name }))
  const location = [
    names.barangay(b.barangay_id),
    names.municipality(b.municipality_id),
    names.province(b.province_id),
  ]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .join(', ')

  const toggleTrash = () =>
    setConfirm({
      title: b.deleted_at ? `Restore ${b.name}?` : `Move ${b.name} to Trash?`,
      confirmLabel: b.deleted_at ? 'Restore' : 'Move to Trash',
      destructive: !b.deleted_at,
      onConfirm: async () => {
        try {
          await trash.mutateAsync({ id: b.id, restore: !!b.deleted_at })
          toast.success(b.deleted_at ? 'Restored' : 'Moved to Trash')
          void refetch()
        } catch (err) {
          toast.error(errorMessage(err))
        }
      },
    })

  return (
    <div className="space-y-6">
      <Link
        to="/beneficiaries"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> Beneficiaries
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{b.name}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{names.type(b.type_id)}</Badge>
            <StatusBadge status={b.status} />
            {b.deleted_at && <Badge variant="destructive">In Trash</Badge>}
            <span>{location}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && !b.deleted_at && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
          )}
          {canTrash && (
            <Button
              variant={b.deleted_at ? 'outline' : 'ghost'}
              onClick={toggleTrash}
              className={b.deleted_at ? '' : 'text-destructive'}
            >
              {b.deleted_at ? <ArchiveRestoreIcon /> : <Trash2Icon />}
              {b.deleted_at ? 'Restore' : 'Move to Trash'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="Registration no.">
                  {b.registration_no
                    ? `${b.registration_no}${b.registration_agency ? ` (${b.registration_agency})` : ''}`
                    : null}
                </Item>
                <Item label="Registered by">
                  {program ? <ProgramChip program={program} /> : 'FOD'}
                </Item>
                <Item label="Contact person">{b.contact_person}</Item>
                <Item label="Contact no.">{b.contact_no}</Item>
                <Item label="Email">{b.email}</Item>
                <Item label="Address">{[b.address_line, location].filter(Boolean).join(', ')}</Item>
                <Item label="Farm area">
                  {b.area_ha !== null ? `${Number(b.area_ha).toLocaleString()} ha` : null}
                </Item>
                <Item label="Commodities">
                  {b.commodity_ids.length ? (
                    <span className="flex flex-wrap gap-1">
                      {b.commodity_ids.map((c) => (
                        <Badge key={c} variant="secondary" className="font-normal">
                          {names.commodity(c)}
                        </Badge>
                      ))}
                    </span>
                  ) : null}
                </Item>
                {b.remarks && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground text-xs">Remarks</dt>
                    <dd className="whitespace-pre-line">{b.remarks}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>{b.members_total.toLocaleString()} total</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {(
                  [
                    ['Male', b.members_male],
                    ['Female', b.members_female],
                    ['IP', b.members_ip],
                    ['Youth', b.members_youth],
                    ['PWD', b.members_pwd],
                    ['Senior', b.members_senior],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="rounded-md border p-3">
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{n.toLocaleString()}</dd>
                    {b.members_total > 0 && (
                      <dd className="text-muted-foreground text-[11px]">
                        {Math.round((n / b.members_total) * 100)}%
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <AssistanceHistory beneficiaryId={b.id} />

          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
              <CardDescription>Registration certificates, resolutions, photos</CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentsPanel
                entityType="beneficiary"
                entityId={b.id}
                programId={owner}
                canUpload={canEdit && !b.deleted_at}
              />
            </CardContent>
          </Card>

          <Card id="discussion">
            <CardHeader>
              <CardTitle>Discussion</CardTitle>
              <CardDescription>
                The registry is shared, so every program can read and join this thread.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommentsPanel
                entityType="beneficiary"
                entityId={b.id}
                people={mentionable}
                personName={personName}
                canModerate={canTrash}
                canComment={!b.deleted_at}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {b.latitude !== null && b.longitude !== null && (
            <Card className="py-0">
              <Suspense fallback={<Skeleton className="h-64" />}>
                <BeneficiaryMap rows={[b]} describe={() => location} />
              </Suspense>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notes</CardTitle>
              <CardDescription>Private to you, or shared with every user.</CardDescription>
            </CardHeader>
            <CardContent>
              <NotesPanel
                entityType="beneficiary"
                entityId={b.id}
                personName={personName}
                canModerate={canTrash}
                sharedLabel="Everyone"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Record</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-1 text-xs">
              <p>
                Created {formatDateTime(b.created_at)}
                {b.created_by && ` by ${people?.get(b.created_by) ?? 'a user'}`}
              </p>
              <p>Last updated {formatDateTime(b.updated_at)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <BeneficiaryFormDialog open={editing} onOpenChange={setEditing} beneficiary={b} />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}
