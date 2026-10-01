import { MenuIcon, XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { MaintenanceBanner } from './MaintenanceBanner'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'
import { WorkspaceFilters } from './WorkspaceFilters'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block print:hidden">
        <Sidebar />
      </aside>

      {/* Mobile / tablet drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-xl lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Main navigation
            </DialogPrimitive.Description>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <DialogPrimitive.Close
              className="text-sidebar-foreground hover:bg-sidebar-accent absolute top-4 right-3 rounded p-1"
              aria-label="Close navigation"
            >
              <XIcon className="size-5" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <MaintenanceBanner />
        <header className="bg-background/90 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur sm:gap-3 sm:px-6 print:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <div className="hidden md:block">
            <WorkspaceFilters />
          </div>
          <NotificationBell />
          <UserMenu />
        </header>

        {/* Filters move under the header on small screens */}
        <div className="border-b px-4 py-2 md:hidden">
          <WorkspaceFilters />
        </div>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading page">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-64" />
    </div>
  )
}
