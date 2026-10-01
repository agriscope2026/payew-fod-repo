import { useCallback, useSyncExternalStore } from 'react'
import { storage } from '@/lib/utils'

export type Theme = 'light' | 'dark'
const KEY = 'payew-theme'

// The <html> class is the single source of truth (index.html sets it before first paint),
// so every component using this hook stays in sync.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const getTheme = (): Theme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as Theme)

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark')
    storage.set(KEY, next)
  }, [])

  const toggle = useCallback(() => setTheme(getTheme() === 'dark' ? 'light' : 'dark'), [setTheme])

  return { theme, setTheme, toggle }
}
