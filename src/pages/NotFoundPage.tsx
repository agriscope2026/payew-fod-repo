import { MapPinOffIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <MapPinOffIcon className="text-muted-foreground size-12" />
      <p className="text-muted-foreground text-sm font-semibold tracking-widest">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        The page may have moved, or the link is incorrect.
      </p>
      <Button asChild className="mt-2">
        <Link to="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  )
}
