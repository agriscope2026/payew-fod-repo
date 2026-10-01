import { BellIcon, CheckCheckIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useNotificationsRealtime,
  useUnreadCount,
} from '../api'
import { NotificationItem } from './NotificationItem'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: unread = 0 } = useUnreadCount()
  const { data: items, isPending } = useNotifications({ limit: 8 })
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  useNotificationsRealtime(useCallback((title: string) => toast(title, { icon: '🔔' }), []))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <BellIcon className="size-5" />
          {unread > 0 && (
            <span className="bg-destructive absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={!unread || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheckIcon /> Mark all read
          </Button>
        </div>
        <div className="max-h-[60vh] divide-y overflow-y-auto">
          {isPending &&
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          {items?.length === 0 && (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">
              You're all caught up.
            </p>
          )}
          {items?.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              compact
              onOpen={(item) => {
                if (!item.is_read) markRead.mutate([item.id])
                setOpen(false)
              }}
            />
          ))}
        </div>
        <div className="border-t p-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            <Link to="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
