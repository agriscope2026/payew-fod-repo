import { LogoMark } from './Logo'

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="bg-background flex min-h-dvh flex-col items-center justify-center gap-4"
      role="status"
    >
      <LogoMark className="size-12 animate-pulse" />
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  )
}
