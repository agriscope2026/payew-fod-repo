import {
  ArrowLeftRightIcon,
  BanIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  FileWarningIcon,
  GitBranchIcon,
  RepeatIcon,
  SkipForwardIcon,
  Undo2Icon,
  WalletIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ApprovalStatus, ApprovalType } from '@/types/database'

export const TYPE_META: Record<ApprovalType, { label: string; icon: LucideIcon }> = {
  cancellation: { label: 'Cancellation', icon: BanIcon },
  extension: { label: 'Extension', icon: CalendarPlusIcon },
  stage_skip: { label: 'Stage skip', icon: SkipForwardIcon },
  workflow_change: { label: 'Workflow change', icon: GitBranchIcon },
  supplier_reaward: { label: 'Supplier change / re-award', icon: RepeatIcon },
  contract_variation: { label: 'Contract amount variation', icon: WalletIcon },
  obligation_exception: { label: 'Obligation-order exception', icon: FileWarningIcon },
  realignment: { label: 'Realignment', icon: ArrowLeftRightIcon },
}

/** Status with icon + label (never color alone). */
export const STATUS_META: Record<
  ApprovalStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  pending: { label: 'Pending', icon: CircleDotIcon, className: 'border-primary/40 text-primary' },
  approved: {
    label: 'Approved',
    icon: CheckCircle2Icon,
    className: 'border-success/40 text-success',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircleIcon,
    className: 'border-destructive/40 text-destructive',
  },
  withdrawn: { label: 'Withdrawn', icon: Undo2Icon, className: 'text-muted-foreground' },
}
