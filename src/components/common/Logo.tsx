import { APP_NAME } from '@/lib/env'
import { cn } from '@/lib/utils'

/** Rice-terrace mark: stacked steps = workflow stages, flow = funds. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8', className)}>
      <rect width="32" height="32" rx="7" fill="#166534" />
      <path
        d="M5 24h22M7 19.5h18M9 15h14M11 10.5h10"
        stroke="#facc15"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-tight">
        <div className="text-base font-bold tracking-wide">{APP_NAME}</div>
        {subtitle && <div className="text-[11px] opacity-75">DA-CAR · Field Operations</div>}
      </div>
    </div>
  )
}
