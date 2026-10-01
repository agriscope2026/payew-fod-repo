import { createElement } from 'react'
import {
  BedDoubleIcon,
  BoxIcon,
  BusIcon,
  HandshakeIcon,
  LandmarkIcon,
  PackageIcon,
  PrinterIcon,
  TractorIcon,
  UtensilsIcon,
  type LucideIcon,
} from 'lucide-react'

/** Icon per procurement category code; unknown codes fall back to a box. */
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  LODGING: BedDoubleIcon,
  MEALS: UtensilsIcon,
  TRANSPORT: BusIcon,
  SUPPLIES: BoxIcon,
  VENUE: LandmarkIcon,
  PRINTING: PrinterIcon,
  EQUIPMENT: TractorIcon,
  SERVICES: HandshakeIcon,
  OTHER: PackageIcon,
}

export const categoryIcon = (code: string | null | undefined) =>
  (code && CATEGORY_ICON[code]) || PackageIcon

/** Suggested package titles for the quick template picker. */
export const CATEGORY_TITLE: Record<string, string> = {
  LODGING: 'Lodging for participants and resource persons',
  MEALS: 'Meals and snacks for participants',
  TRANSPORT: 'Vehicle rental for field transport',
  SUPPLIES: 'Supplies and materials',
  VENUE: 'Function hall / venue rental',
  PRINTING: 'Printing of IEC materials and certificates',
  EQUIPMENT: 'Equipment and tools',
  SERVICES: 'Resource person and technical services',
  OTHER: 'Other goods or services',
}

/** Renders the icon of a category code. */
export function CategoryIcon({
  code,
  className,
}: {
  code: string | null | undefined
  className?: string
}) {
  return createElement(categoryIcon(code), { className, 'aria-hidden': true })
}
