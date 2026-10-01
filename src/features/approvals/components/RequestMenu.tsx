import { ChevronDownIcon, ClipboardCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ApprovalType } from '@/types/database'
import { TYPE_META } from '../meta'
import { RequestDialog, type RequestTarget } from './RequestDialog'

/** "Request…" button listing the approval requests available for a record. */
export function RequestMenu({ types, target }: { types: ApprovalType[]; target: RequestTarget }) {
  const [open, setOpen] = useState<ApprovalType | null>(null)
  if (!types.length) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <ClipboardCheckIcon /> Request <ChevronDownIcon className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {types.map((t) => {
            const m = TYPE_META[t]
            return (
              <DropdownMenuItem key={t} onSelect={() => setOpen(t)}>
                <m.icon /> {m.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {open && <RequestDialog type={open} target={target} onClose={() => setOpen(null)} />}
    </>
  )
}
