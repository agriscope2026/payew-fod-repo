import type { ReactNode } from 'react'
import { Logo } from '@/components/common/Logo'
import { APP_FULL_NAME, APP_NAME } from '@/lib/env'

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Logo />
        <div className="relative z-10 max-w-md space-y-4">
          <p className="text-gold text-xs font-semibold tracking-[0.2em] uppercase">
            Department of Agriculture · Cordillera Administrative Region
          </p>
          <h1 className="text-3xl leading-tight font-bold">Every peso, every step, tracked.</h1>
          <p className="text-sidebar-muted text-sm">
            {APP_NAME} ({APP_FULL_NAME}) follows each FOD program from allotment to obligation,
            disbursement and savings, with every activity's workflow, deadlines and follow-ups.
          </p>
        </div>
        <p className="text-sidebar-muted relative z-10 text-xs">
          Field Operations Division · DA-CAR
        </p>
        <TerraceArt />
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Logo className="text-foreground" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

function TerraceArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 400"
      className="pointer-events-none absolute right-0 bottom-0 w-full opacity-25"
      preserveAspectRatio="xMaxYMax slice"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          d={`M0 ${400 - i * 34} C 150 ${380 - i * 34}, 300 ${410 - i * 36}, 600 ${370 - i * 38}`}
          fill="none"
          stroke={i % 2 ? '#facc15' : '#86efac'}
          strokeWidth="3"
        />
      ))}
    </svg>
  )
}
