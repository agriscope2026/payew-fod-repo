import { KeyRoundIcon, LogOutIcon, MoonIcon, SunIcon, UserIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-context'
import { ROLE_LABELS } from '@/features/auth/permissions'
import { UserAvatar } from '@/features/profile/UserAvatar'
import { useTheme } from '@/hooks/use-theme'

export function UserMenu() {
  const { profile, role, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-full p-0.5 outline-none focus-visible:ring-[3px] md:rounded-md md:pr-2"
        aria-label="Account menu"
      >
        <UserAvatar name={profile?.full_name} avatarKey={profile?.avatar_key} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-40 truncate text-sm font-medium">{profile?.full_name}</span>
          <span className="text-muted-foreground block text-[11px]">
            {role && ROLE_LABELS[role]}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate font-medium">{profile?.full_name}</p>
          <p className="text-muted-foreground truncate text-xs font-normal">{profile?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserIcon /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/account/password')}>
          <KeyRoundIcon /> Change password
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            toggle()
          }}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
