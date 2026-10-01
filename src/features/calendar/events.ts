import {
  AlarmClockIcon,
  CalendarRangeIcon,
  FlagIcon,
  GavelIcon,
  MegaphoneIcon,
  PackageCheckIcon,
  ScrollTextIcon,
  TargetIcon,
  TruckIcon,
  WalletIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react'
import type { CalendarEvent, CalendarEventKind } from '@/types/database'

export type EventGroup = 'activities' | 'stages' | 'packages' | 'directives' | 'issues'

export const KIND_META: Record<
  CalendarEventKind,
  { label: string; icon: LucideIcon; group: EventGroup }
> = {
  activity: { label: 'Implementation', icon: CalendarRangeIcon, group: 'activities' },
  activity_due: { label: 'Activity due', icon: TargetIcon, group: 'activities' },
  stage_due: { label: 'Stage target', icon: WorkflowIcon, group: 'stages' },
  pkg_solicitation: { label: 'Solicitation', icon: MegaphoneIcon, group: 'packages' },
  pkg_award: { label: 'Award', icon: GavelIcon, group: 'packages' },
  pkg_due: { label: 'Package due', icon: PackageCheckIcon, group: 'packages' },
  delivery: { label: 'Delivery', icon: TruckIcon, group: 'packages' },
  payment_due: { label: 'Payment due', icon: WalletIcon, group: 'packages' },
  directive_due: { label: 'Response due', icon: ScrollTextIcon, group: 'directives' },
  issue_due: { label: 'Issue target', icon: FlagIcon, group: 'issues' },
}

export const GROUPS: { key: EventGroup; label: string }[] = [
  { key: 'activities', label: 'Activities' },
  { key: 'stages', label: 'Stage targets' },
  { key: 'packages', label: 'Package events' },
  { key: 'directives', label: 'Directives' },
  { key: 'issues', label: 'Issues' },
]

/**
 * Procurement categories → categorical slots, in fixed order (never cycled).
 * Anything else, including "Other", folds into neutral gray.
 */
export const CATEGORY_SLOTS: { code: string; label: string; border: string; swatch: string }[] = [
  { code: 'LODGING', label: 'Lodging', border: 'border-l-viz-cat-1', swatch: 'bg-viz-cat-1' },
  { code: 'MEALS', label: 'Meals', border: 'border-l-viz-cat-2', swatch: 'bg-viz-cat-2' },
  { code: 'TRANSPORT', label: 'Transport', border: 'border-l-viz-cat-3', swatch: 'bg-viz-cat-3' },
  { code: 'SUPPLIES', label: 'Supplies', border: 'border-l-viz-cat-4', swatch: 'bg-viz-cat-4' },
  { code: 'VENUE', label: 'Venue', border: 'border-l-viz-cat-5', swatch: 'bg-viz-cat-5' },
  { code: 'PRINTING', label: 'Printing', border: 'border-l-viz-cat-6', swatch: 'bg-viz-cat-6' },
  { code: 'EQUIPMENT', label: 'Equipment', border: 'border-l-viz-cat-7', swatch: 'bg-viz-cat-7' },
  { code: 'SERVICES', label: 'Services', border: 'border-l-viz-cat-8', swatch: 'bg-viz-cat-8' },
]
export const OTHER_SLOT = {
  code: 'OTHER',
  label: 'Other',
  border: 'border-l-muted-foreground/50',
  swatch: 'bg-muted-foreground/50',
}

export function categorySlot(code: string | null) {
  return CATEGORY_SLOTS.find((c) => c.code === code) ?? OTHER_SLOT
}

/** Where clicking an event goes. */
export function eventHref(e: CalendarEvent) {
  const act = e.activity_id ? `/activities/${e.activity_id}` : null
  const pkg = act && e.package_id ? `${act}/packages/${e.package_id}` : null
  switch (e.kind) {
    case 'activity':
    case 'activity_due':
      return act!
    case 'stage_due':
      return `${act}?tab=workflow`
    case 'pkg_solicitation':
    case 'pkg_award':
    case 'pkg_due':
      return `${pkg}?tab=workflow`
    case 'delivery':
    case 'payment_due':
      return `${pkg}?tab=finance`
    case 'directive_due':
      return `/directives/${e.ref_id}`
    case 'issue_due':
      return `${act}?tab=issues`
  }
}

export const OverdueIcon = AlarmClockIcon
