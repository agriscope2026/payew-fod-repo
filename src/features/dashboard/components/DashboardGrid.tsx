import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GripVerticalIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  GRID_COLUMNS,
  moveWidget,
  resizeWidget,
  shiftWidget,
  type LayoutItem,
  type WidgetId,
} from '../layout'

const ROW_HEIGHT = 64
const GAP = 16

/**
 * Twelve-column card grid. In edit mode a card moves by dragging its title bar and
 * resizes from its corner; the buttons on each card do the same without a mouse.
 * Below the lg breakpoint cards stack and take their natural height.
 */
export function DashboardGrid({
  layout,
  editing,
  onChange,
  renderWidget,
  titleOf,
}: {
  layout: LayoutItem[]
  editing: boolean
  onChange: (next: LayoutItem[]) => void
  renderWidget: (id: WidgetId) => ReactNode
  titleOf: (id: WidgetId) => string
}) {
  const grid = useRef<HTMLDivElement>(null)
  // Pointer handlers outlive a render, so they read the newest layout from here.
  const latest = useRef(layout)
  useEffect(() => {
    latest.current = layout
  }, [layout])

  const startDrag = (id: WidgetId) => (e: ReactPointerEvent) => {
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY)
      const over = under?.closest<HTMLElement>('[data-widget]')?.dataset.widget as
        WidgetId | undefined
      if (over && over !== id) onChange(moveWidget(latest.current, id, over))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startResize = (item: LayoutItem) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const width = grid.current?.clientWidth ?? 1200
    const colWidth = (width + GAP) / GRID_COLUMNS
    const rowHeight = ROW_HEIGHT + GAP
    const move = (ev: PointerEvent) => {
      const w = item.w + Math.round((ev.clientX - startX) / colWidth)
      const h = item.h + Math.round((ev.clientY - startY) / rowHeight)
      onChange(resizeWidget(latest.current, item.id, w, h))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const nudge = (item: LayoutItem, dw: number, dh: number) =>
    onChange(resizeWidget(layout, item.id, item.w + dw, item.h + dh))

  return (
    <div
      ref={grid}
      className="grid grid-cols-1 gap-4 lg:[grid-auto-flow:dense] lg:auto-rows-[64px] lg:grid-cols-12"
    >
      {layout
        .filter((item) => !item.hidden)
        .map((item) => {
          const title = titleOf(item.id)
          return (
            <section
              key={item.id}
              data-widget={item.id}
              aria-label={title}
              style={{ '--w': item.w, '--h': item.h } as CSSProperties}
              className={cn(
                'relative flex min-w-0 flex-col lg:[grid-column:span_var(--w)/span_var(--w)] lg:[grid-row:span_var(--h)/span_var(--h)]',
                editing && 'ring-primary/50 rounded-xl ring-2',
              )}
            >
              {editing && (
                <div className="bg-muted flex items-center gap-1 rounded-t-xl px-1.5 py-1 text-xs">
                  <span
                    className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-1 active:cursor-grabbing"
                    onPointerDown={startDrag(item.id)}
                  >
                    <GripVerticalIcon className="size-3.5 shrink-0" />
                    <span className="truncate font-medium">{title}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {item.w}×{item.h}
                  </span>
                  <Tool
                    label={`Move ${title} earlier`}
                    onClick={() => onChange(shiftWidget(layout, item.id, -1))}
                  >
                    <ArrowLeftIcon />
                  </Tool>
                  <Tool
                    label={`Move ${title} later`}
                    onClick={() => onChange(shiftWidget(layout, item.id, 1))}
                  >
                    <ArrowRightIcon />
                  </Tool>
                  <Tool label={`Make ${title} narrower`} onClick={() => nudge(item, -1, 0)}>
                    <MinusIcon />
                  </Tool>
                  <Tool label={`Make ${title} wider`} onClick={() => nudge(item, 1, 0)}>
                    <PlusIcon />
                  </Tool>
                  <Tool label={`Make ${title} shorter`} onClick={() => nudge(item, 0, -1)}>
                    <MinusIcon className="rotate-90" />
                  </Tool>
                  <Tool label={`Make ${title} taller`} onClick={() => nudge(item, 0, 1)}>
                    <PlusIcon className="rotate-90" />
                  </Tool>
                </div>
              )}
              <div
                className={cn(
                  'min-h-0 flex-1 lg:overflow-auto [&>*]:lg:min-h-full',
                  editing && 'pointer-events-none select-none',
                )}
              >
                {renderWidget(item.id)}
              </div>
              {editing && (
                <span
                  role="presentation"
                  title="Drag to resize"
                  className="bg-primary text-primary-foreground absolute right-0 bottom-0 z-10 hidden size-5 cursor-nwse-resize touch-none items-center justify-center rounded-tl-md rounded-br-xl lg:flex"
                  onPointerDown={startResize(item)}
                >
                  <MaximizeIcon className="size-3 rotate-90" />
                </span>
              )}
            </section>
          )
        })}
    </div>
  )
}

function Tool({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 [&_svg]:size-3"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
