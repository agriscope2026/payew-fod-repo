import { ArrowRightIcon, FolderKanbanIcon, MoonIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navForRole } from '@/components/layout/nav-config'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTheme } from '@/hooks/use-theme'

/**
 * Ctrl/Cmd+K palette. Phase 1: pages, programs and quick actions.
 * Later phases add an RLS-aware `global_search` RPC over activities, beneficiaries,
 * finance documents, comments and files.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { role, programs } = useAuth()
  const { setProgramFilter, canChangeProgram } = useWorkspace()
  const { toggle } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-card text-muted-foreground hover:bg-accent flex h-9 w-full max-w-xs items-center gap-2 rounded-md border px-3 text-sm shadow-xs transition-colors"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search…</span>
        <kbd className="bg-muted hidden rounded border px-1.5 font-mono text-[10px] sm:inline">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showClose={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search pages, programs and actions
          </DialogDescription>
          <Command>
            <CommandInput placeholder="Search pages, programs, actions…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {navForRole(role).map((section) => (
                <CommandGroup key={section.title} heading={section.title}>
                  {section.items.map((item) => (
                    <CommandItem
                      key={item.to}
                      value={`${item.label} ${item.keywords ?? ''} ${item.description}`}
                      onSelect={() => run(() => navigate(item.to))}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                      <span className="text-muted-foreground ml-auto truncate pl-4 text-xs">
                        {item.description}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {programs.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Programs">
                    {programs.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`program ${p.code} ${p.name}`}
                        onSelect={() =>
                          run(() => {
                            if (canChangeProgram) setProgramFilter(p.id)
                            navigate('/dashboard')
                          })
                        }
                      >
                        <FolderKanbanIcon style={{ color: p.color }} className="text-[inherit]" />
                        <span className="font-medium">{p.code}</span>
                        <span className="text-muted-foreground truncate">{p.name}</span>
                        <ArrowRightIcon className="ml-auto" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              <CommandSeparator />
              <CommandGroup heading="Actions">
                {role !== 'program_staff' && (
                  <CommandItem
                    value="new activity create"
                    onSelect={() => run(() => navigate('/activities'))}
                  >
                    <PlusIcon /> New activity
                  </CommandItem>
                )}
                <CommandItem value="toggle dark mode theme" onSelect={() => run(toggle)}>
                  <MoonIcon /> Toggle dark mode
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
