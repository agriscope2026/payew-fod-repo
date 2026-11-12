import { APP_NAME } from '@/lib/env'
import { cn } from '@/lib/utils'

/** The DA Regional Field Office – CAR seal, on white so it reads on any background. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/da-car-logo-192.png"
      alt=""
      aria-hidden="true"
      className={cn('size-10 shrink-0 rounded-md bg-white object-contain p-0.5', className)}
    />
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
