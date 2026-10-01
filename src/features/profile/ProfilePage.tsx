import { BellIcon, CameraIcon, KeyRoundIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip, RoleBadge } from '@/components/common/Badges'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useLocations } from '@/features/locations/api'
import { formatDateTime, formatRelative } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { useMyRecentActivity, useProfileMutations, type ProfileInput } from './api'
import { UserAvatar } from './UserAvatar'

/** Raw photos up to this size are accepted; they're compressed before upload. */
const AVATAR_MAX = 25 * 1024 * 1024

const ACTION_VERB: Record<string, string> = {
  INSERT: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  SOFT_DELETE: 'Moved to Trash',
  RESTORE: 'Restored',
  LOGIN: 'Signed in',
}

/** /profile — your details, photo, and what you changed recently. */
export default function ProfilePage() {
  const { profile, programs, role } = useAuth()
  if (!profile) return <Skeleton className="h-96" />
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Profile" description="Your details as other users see them." />
      <div className="grid gap-6 lg:grid-cols-3">
        <PhotoCard />
        <DetailsCard key={profile.updated_at} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <Row label="Email">{profile.email}</Row>
          <Row label="Role">{role && <RoleBadge role={role} />}</Row>
          <Row label="Programs">
            <span className="flex flex-wrap gap-1">
              {role === 'superadmin'
                ? 'All programs'
                : programs.map((p) => <ProgramChip key={p.id} program={p} />)}
            </span>
          </Row>
          <Row label="Edit activities">
            {role === 'program_staff'
              ? profile.can_edit_activities
                ? 'Yes'
                : 'No (read-only)'
              : 'Yes'}
          </Row>
          <Row label="Last sign-in">{formatDateTime(profile.last_login_at)}</Row>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/account/password">
                <KeyRoundIcon /> Change password
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/notifications">
                <BellIcon /> Notification preferences
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <RecentActivity />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function PhotoCard() {
  const { profile } = useAuth()
  const { setAvatar } = useProfileMutations()
  const input = useRef<HTMLInputElement>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file.')
    if (file.size > AVATAR_MAX) return toast.error('The photo must be 25 MB or smaller.')
    try {
      await setAvatar.mutateAsync(file)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <UserAvatar name={profile?.full_name} avatarKey={profile?.avatar_key} className="size-24" />
        <div>
          <p className="font-semibold">{profile?.full_name}</p>
          <p className="text-muted-foreground text-sm">{profile?.position || '—'}</p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a profile photo"
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={setAvatar.isPending}
            onClick={() => input.current?.click()}
          >
            {setAvatar.isPending ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
            {profile?.avatar_key ? 'Change photo' : 'Add photo'}
          </Button>
          {profile?.avatar_key && (
            <Button
              variant="ghost"
              size="sm"
              disabled={setAvatar.isPending}
              aria-label="Remove photo"
              onClick={() =>
                setAvatar.mutate(null, {
                  onSuccess: () => toast.success('Photo removed'),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          JPG, PNG or WebP. It is cropped to a square and compressed automatically.
        </p>
      </CardContent>
    </Card>
  )
}

function DetailsCard() {
  const { profile } = useAuth()
  const { save } = useProfileMutations()
  const { data: locations } = useLocations()
  const [form, setForm] = useState<ProfileInput>({
    full_name: profile?.full_name ?? '',
    position: profile?.position ?? '',
    office: profile?.office ?? '',
    province_id: profile?.province_id ?? '',
    contact_no: profile?.contact_no ?? '',
  })
  const set = (k: keyof ProfileInput, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const nameError = form.full_name.trim().length < 2 ? 'Enter your full name.' : undefined
  const dirty =
    form.full_name !== (profile?.full_name ?? '') ||
    form.position !== (profile?.position ?? '') ||
    form.office !== (profile?.office ?? '') ||
    form.province_id !== (profile?.province_id ?? '') ||
    form.contact_no !== (profile?.contact_no ?? '')

  const submit = async () => {
    try {
      await save.mutateAsync({
        full_name: form.full_name.trim(),
        position: form.position?.trim() || null,
        office: form.office?.trim() || null,
        province_id: form.province_id || null,
        contact_no: form.contact_no?.trim() || null,
      })
      toast.success('Profile saved')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
        <CardDescription>Shown in assignments, comments and directives.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField id="pf-name" label="Full name *" error={nameError}>
            <Input
              id="pf-name"
              maxLength={120}
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
            />
          </FormField>
        </div>
        <FormField id="pf-position" label="Position">
          <Input
            id="pf-position"
            maxLength={120}
            value={form.position ?? ''}
            onChange={(e) => set('position', e.target.value)}
          />
        </FormField>
        <FormField id="pf-office" label="Office / unit">
          <Input
            id="pf-office"
            maxLength={120}
            value={form.office ?? ''}
            onChange={(e) => set('office', e.target.value)}
          />
        </FormField>
        <FormField id="pf-province" label="Province">
          <SelectNative
            id="pf-province"
            value={form.province_id ?? ''}
            onChange={(e) => set('province_id', e.target.value)}
          >
            <option value="">—</option>
            {(locations?.provinces ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectNative>
        </FormField>
        <FormField id="pf-contact" label="Contact number">
          <Input
            id="pf-contact"
            inputMode="tel"
            maxLength={40}
            value={form.contact_no ?? ''}
            onChange={(e) => set('contact_no', e.target.value)}
          />
        </FormField>
        <div className="flex justify-end sm:col-span-2">
          <Button disabled={!dirty || !!nameError || save.isPending} onClick={() => void submit()}>
            {save.isPending && <Loader2Icon className="animate-spin" />} Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RecentActivity() {
  const { data, isPending } = useMyRecentActivity()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your recent activity</CardTitle>
        <CardDescription>The last 30 changes you made.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-40" />
        ) : !data?.length ? (
          <p className="text-muted-foreground text-sm">Nothing yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.map((r, i) => (
              <li key={i} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1">
                  {ACTION_VERB[r.action] ?? r.action}{' '}
                  <span className="text-muted-foreground">
                    {r.table_name.replace(/_/g, ' ')}
                    {r.changed_fields?.length
                      ? ` · ${r.changed_fields.slice(0, 4).join(', ')}`
                      : ''}
                  </span>
                </span>
                <span
                  className="text-muted-foreground shrink-0 text-xs"
                  title={formatDateTime(r.occurred_at)}
                >
                  {formatRelative(r.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
