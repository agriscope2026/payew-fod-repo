import { ShieldXIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <ShieldXIcon className="text-destructive size-12" />
      <p className="text-muted-foreground text-sm font-semibold tracking-widest">403</p>
      <h1 className="text-2xl font-semibold">You don't have access to this page</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Your role doesn't include this module. If you think this is a mistake, contact your program
        admin or the FOD superadmin.
      </p>
      <Button asChild className="mt-2">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  )
}
