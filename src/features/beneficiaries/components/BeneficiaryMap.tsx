import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { Beneficiary } from '../api'

// Cordillera Administrative Region
const CAR_CENTER: [number, number] = [17.35, 121.0]

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  // Re-fit only when the set of coordinates changes, not on every render.
  const key = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 11)
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 12 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

/**
 * Beneficiaries with coordinates as single-hue markers (r = 7px, 2px surface ring).
 * Loaded lazily so Leaflet only downloads when the map view is opened.
 */
export default function BeneficiaryMap({
  rows,
  describe,
}: {
  rows: Beneficiary[]
  describe: (b: Beneficiary) => string
}) {
  const located = rows.filter((r) => r.latitude !== null && r.longitude !== null)
  const points = located.map((r) => [Number(r.latitude), Number(r.longitude)] as [number, number])

  return (
    <div className="space-y-2">
      <div className="h-[28rem] overflow-hidden rounded-lg border">
        <MapContainer center={CAR_CENTER} zoom={8} className="size-full" scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {located.map((b) => (
            <CircleMarker
              key={b.id}
              center={[Number(b.latitude), Number(b.longitude)]}
              radius={7}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#15803d', fillOpacity: 0.9 }}
            >
              <Tooltip>{b.name}</Tooltip>
              <Popup>
                <p className="font-semibold">{b.name}</p>
                <p className="text-xs">{describe(b)}</p>
                <Link to={`/beneficiaries/${b.id}`} className="text-xs">
                  Open profile →
                </Link>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="text-muted-foreground text-xs">
        {located.length} of {rows.length} beneficiaries have coordinates. Add latitude/longitude in
        a record to show it on the map.
      </p>
    </div>
  )
}
