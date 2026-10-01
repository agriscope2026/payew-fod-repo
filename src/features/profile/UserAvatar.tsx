import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, initials } from '@/lib/utils'
import { useAvatarUrl } from './api'

/** Profile photo with initials as the fallback. */
export function UserAvatar({
  name,
  avatarKey,
  className,
}: {
  name: string | null | undefined
  avatarKey: string | null | undefined
  className?: string
}) {
  const { data: url } = useAvatarUrl(avatarKey)
  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} alt="" className="object-cover" />}
      <AvatarFallback className={cn(className?.includes('size-') && 'text-lg')}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
