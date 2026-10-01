import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Beneficiary } from '../api'

const compact = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat('en-PH')
const fmt = (n: number) => (n >= 10_000 ? compact.format(n) : full.format(n))

/**
 * KPI row (stat tiles) plus one single-series bar list: members by province.
 * One hue (primary) → no legend; values sit at the bar tips in text colors.
 */
export function BeneficiaryStats({
  rows,
  provinces,
}: {
  rows: Beneficiary[]
  provinces: { id: string; name: string }[]
}) {
  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === 'active')
    const sum = (k: 'members_total' | 'members_female' | 'members_ip' | 'members_youth') =>
      rows.reduce((a, r) => a + r[k], 0)
    const byProvince = provinces
      .map((p) => {
        const inProv = rows.filter((r) => r.province_id === p.id)
        return {
          id: p.id,
          name: p.name,
          orgs: inProv.length,
          members: inProv.reduce((a, r) => a + r.members_total, 0),
        }
      })
      .filter((p) => p.orgs > 0)
      .sort((a, b) => b.members - a.members)
    return {
      total: rows.length,
      active: active.length,
      members: sum('members_total'),
      women: sum('members_female'),
      ip: sum('members_ip'),
      youth: sum('members_youth'),
      area: rows.reduce((a, r) => a + (r.area_ha ?? 0), 0),
      byProvince,
    }
  }, [rows, provinces])

  const max = Math.max(1, ...stats.byProvince.map((p) => p.members))
  const pct = (n: number) =>
    stats.members ? `${Math.round((n / stats.members) * 100)}% of members` : ''

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Beneficiaries" value={fmt(stats.total)} hint={`${fmt(stats.active)} active`} />
        <Tile
          label="Total members"
          value={fmt(stats.members)}
          hint={`${fmt(stats.women)} women · ${pct(stats.women)}`}
        />
        <Tile label="IP members" value={fmt(stats.ip)} hint={pct(stats.ip)} />
        <Tile
          label="Farm area"
          value={`${fmt(Math.round(stats.area))} ha`}
          hint={`${fmt(stats.youth)} youth members`}
        />
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Members by province</CardTitle>
          <CardDescription className="text-xs">
            Filtered list · hover a bar for details
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {stats.byProvince.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data for the current filters.</p>
          ) : (
            <ul className="space-y-1.5">
              {stats.byProvince.map((p) => (
                <li
                  key={p.id}
                  className="group grid grid-cols-[7.5rem_1fr] items-center gap-2 text-xs"
                  title={`${p.name}: ${full.format(p.members)} members in ${p.orgs} organization${p.orgs === 1 ? '' : 's'}`}
                >
                  <span className="text-muted-foreground group-hover:text-foreground truncate">
                    {p.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {/* 12px bar, square at the baseline, 4px rounded data-end */}
                    <span
                      className="bg-primary h-3 rounded-r-[4px] transition-opacity group-hover:opacity-80"
                      style={{ width: `${Math.max(2, (p.members / max) * 100)}%` }}
                    />
                    <span className="shrink-0 font-medium tabular-nums">{fmt(p.members)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
      </CardContent>
    </Card>
  )
}
