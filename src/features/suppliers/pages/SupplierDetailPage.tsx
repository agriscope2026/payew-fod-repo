import {
  AlertTriangleIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  PencilIcon,
  SearchXIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { CommentsPanel } from '@/features/discussion/components/CommentsPanel'
import { NotesPanel } from '@/features/discussion/components/NotesPanel'
import { AttachmentsPanel } from '@/features/files/components/AttachmentsPanel'
import { useLocationLookup } from '@/features/locations/api'
import { categoryIcon } from '@/features/packages/category-meta'
import { PackageStatusBadge } from '@/features/packages/components/PackageBadges'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useProfileNames, useUsers } from '@/features/users/api'
import { formatDate, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { PackageView } from '@/types/database'
import {
  useCanManageSuppliers,
  useSupplier,
  useSupplierBank,
  useSupplierDocuments,
  useSupplierPackages,
  useSupplierRatings,
  useTrashSupplier,
} from '../api'
import { SupplierStatusBadge } from '../components/SupplierBadges'
import { SupplierFormDialog } from '../components/SupplierFormDialog'
import { BankDetails, ComplianceDocuments, RatingsList } from '../components/SupplierPanels'
import { SUPPLIER_TYPES } from '../supplier-logic'

export default function SupplierDetailPage() {
  const { id } = useParams()
  const canManage = useCanManageSuppliers()
  const { programs } = useAuth()
  const { data: s, isPending, isError, refetch } = useSupplier(id)
  const { data: documents = [] } = useSupplierDocuments(id)
  const { data: bank } = useSupplierBank(id, canManage)
  const { data: ratings = [] } = useSupplierRatings(id, canManage)
  const { data: pkgs } = useSupplierPackages(id)
  const { data: names } = useProfileNames()
  const { data: users = [] } = useUsers()
  const location = useLocationLookup()
  const lookups = useProcurementLookups()
  const trash = useTrashSupplier()
  const [editing, setEditing] = useState(false)

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!s) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Supplier not found"
        description="It may have been deleted, or the link is wrong."
        action={
          <Button asChild variant="outline">
            <Link to="/suppliers">Back to Suppliers</Link>
          </Button>
        }
      />
    )
  }

  const personName = (uid: string | null) => (uid ? (names?.get(uid) ?? '') : '')
  const all = [...(pkgs?.current ?? []), ...(pkgs?.former ?? [])]
  const pkgLabel = (pid: string) => {
    const p = all.find((x) => x.id === pid)
    return p ? `${p.code} · ${p.title}` : 'Package in another program'
  }
  const closed = (pkgs?.current ?? []).filter((p) => p.status === 'closed')
  const onTime = closed.filter((p) => !p.due_date || (p.closed_at ?? '').slice(0, 10) <= p.due_date)
  const late = (pkgs?.current ?? []).filter((p) => p.is_overdue || p.stage_overdue)
  const programById = new Map(programs.map((p) => [p.id, p]))

  return (
    <div className="space-y-6">
      <Link
        to="/suppliers"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> Suppliers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <SupplierStatusBadge status={s.status} />
            <span className="text-muted-foreground">
              {SUPPLIER_TYPES.find((t) => t.value === s.supplier_type)?.label}
            </span>
            {s.deleted_at && <Badge variant="destructive">In Trash</Badge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{s.business_name}</h1>
          <p className="text-muted-foreground text-sm">
            {[s.trade_name, s.tin && `TIN ${s.tin}`, location.format(s)]
              .filter((x) => x && x !== '—')
              .join(' · ')}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                trash
                  .mutateAsync({ id: s.id, restore: !!s.deleted_at })
                  .then(() => toast.success(s.deleted_at ? 'Restored' : 'Moved to Trash'))
                  .catch((e) => toast.error(errorMessage(e)))
              }
            >
              {s.deleted_at ? <ArchiveRestoreIcon /> : <Trash2Icon />}
              {s.deleted_at ? 'Restore' : 'Trash'}
            </Button>
          </div>
        )}
      </div>

      {s.status !== 'active' && (
        <div
          className={
            s.status === 'blacklisted'
              ? 'border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-sm'
              : 'border-warning/50 bg-warning/10 rounded-md border p-3 text-sm'
          }
        >
          <strong className="inline-flex items-center gap-1">
            <AlertTriangleIcon className="size-4" />
            {s.status === 'blacklisted'
              ? 'Blacklisted — cannot be awarded.'
              : 'Suspended — awards show a warning.'}
          </strong>{' '}
          {s.status_reason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Packages" value={String(s.packages_count)} hint={`${s.open_packages} open`} />
        <Stat
          label="Total awarded"
          value={formatPeso(Number(s.awarded_total ?? 0))}
          hint={s.last_award_date ? `Last award ${formatDate(s.last_award_date)}` : 'No awards yet'}
        />
        <Stat
          label="Closed on time"
          value={closed.length ? `${onTime.length} of ${closed.length}` : '—'}
          hint={
            closed.length
              ? `${Math.round((onTime.length / closed.length) * 100)}% on-time`
              : 'No closed packages'
          }
        />
        <Stat
          label="Late / overdue now"
          value={String(late.length)}
          hint={`${pkgs?.former.length ?? 0} re-awarded to others`}
          danger={late.length > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Packages</CardTitle>
              <CardDescription>
                Across programs and years you can see. Obligated, delivered and paid amounts arrive
                with the Financial Tracker (Phase 7).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {all.length === 0 ? (
                <p className="text-muted-foreground text-sm">No packages awarded yet.</p>
              ) : (
                <PackagesTable
                  rows={pkgs?.current ?? []}
                  former={pkgs?.former ?? []}
                  programChip={(pid) => {
                    const p = programById.get(pid)
                    return p ? <ProgramChip program={p} /> : null
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="Owner / representative">{s.owner_name}</Item>
                <Item label="Contact">
                  {[s.contact_person, s.contact_no].filter(Boolean).join(' · ')}
                </Item>
                <Item label="Email">{s.email}</Item>
                <Item label="Address">
                  {[s.address_line, location.format(s)].filter((x) => x && x !== '—').join(', ')}
                </Item>
                <Item label="Supplies">
                  <span className="flex flex-wrap gap-1">
                    {s.categories.map((code) => {
                      const Icon = categoryIcon(code)
                      return (
                        <span
                          key={code}
                          className="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                        >
                          <Icon className="size-3" /> {lookups.categoryByCode(code)?.name ?? code}
                        </span>
                      )
                    })}
                  </span>
                </Item>
                <Item label="Notes">{s.notes}</Item>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
              <CardDescription>
                Permits, PhilGEPS certificate, BIR 2303, eligibility documents.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentsPanel
                entityType="supplier"
                entityId={s.id}
                programId={null}
                canUpload={canManage && !s.deleted_at}
              />
            </CardContent>
          </Card>

          <Card id="discussion">
            <CardHeader>
              <CardTitle>Discussion</CardTitle>
              <CardDescription>
                Visible to every user; admins can post admin-only comments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommentsPanel
                entityType="supplier"
                entityId={s.id}
                people={users
                  .filter((u) => u.is_active)
                  .map((u) => ({ id: u.id, full_name: u.full_name }))}
                personName={personName}
                canModerate={canManage}
                canComment={!s.deleted_at}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Eligibility documents</CardTitle>
            </CardHeader>
            <CardContent>
              <ComplianceDocuments supplier={s} documents={documents} canManage={canManage} />
            </CardContent>
          </Card>
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Bank details</CardTitle>
                <CardDescription>Visible to admins only.</CardDescription>
              </CardHeader>
              <CardContent>
                <BankDetails key={bank?.updated_at ?? 'none'} supplierId={s.id} bank={bank} />
              </CardContent>
            </Card>
          )}
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Performance remarks</CardTitle>
                <CardDescription>Admins only.</CardDescription>
              </CardHeader>
              <CardContent>
                <RatingsList ratings={ratings} packageLabel={pkgLabel} personName={personName} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notes</CardTitle>
              <CardDescription>Private to you, or shared with every user.</CardDescription>
            </CardHeader>
            <CardContent>
              <NotesPanel
                entityType="supplier"
                entityId={s.id}
                personName={personName}
                canModerate={canManage}
                sharedLabel="Everyone"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {editing && <SupplierFormDialog supplier={s} onClose={() => setEditing(false)} />}
    </div>
  )
}

function PackagesTable({
  rows,
  former,
  programChip,
}: {
  rows: PackageView[]
  former: PackageView[]
  programChip: (programId: string) => ReactNode
}) {
  const line = (p: PackageView, wasReplaced: boolean) => (
    <TableRow key={p.id}>
      <TableCell>
        <Link
          to={`/activities/${p.activity_id}/packages/${p.id}`}
          className="font-medium hover:underline"
        >
          {p.code}
        </Link>
        <p className="text-muted-foreground max-w-72 truncate text-xs">{p.title}</p>
      </TableCell>
      <TableCell>{programChip(p.program_id)}</TableCell>
      <TableCell className="text-xs">{formatDate(p.award_date)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {wasReplaced ? '—' : formatPeso(p.contract_amount)}
      </TableCell>
      <TableCell>
        {wasReplaced ? (
          <Badge variant="outline" className="text-muted-foreground">
            Re-awarded to another supplier
          </Badge>
        ) : (
          <PackageStatusBadge status={p.display_status} />
        )}
      </TableCell>
    </TableRow>
  )
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Package</TableHead>
          <TableHead>Program</TableHead>
          <TableHead>Award</TableHead>
          <TableHead className="text-right">Contract</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => line(p, false))}
        {former.map((p) => line(p, true))}
      </TableBody>
    </Table>
  )
}

function Stat({
  label,
  value,
  hint,
  danger,
}: {
  label: string
  value: string
  hint?: string
  danger?: boolean
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate text-base font-semibold">{value}</p>
        {hint && (
          <p className={danger ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
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
