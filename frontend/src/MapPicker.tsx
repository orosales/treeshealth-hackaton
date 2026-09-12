import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AreaCandidate } from './types'

interface Props { location: { latitude: number; longitude: number } | null; onPick: (location: { latitude: number; longitude: number }) => void; onCandidatePick: (candidate: AreaCandidate) => void; areaMode: boolean; areaCorners: L.LatLng[]; onAreaCorner: (corner: L.LatLng) => void; candidates: AreaCandidate[] }
const HALIFAX: [number, number] = [44.6488, -63.5752]
const severity = { HIGH: 3, MEDIUM: 2, LOW: 1 }

function clusterCandidates(candidates: AreaCandidate[], zoom: number) {
  if (zoom >= 15) return candidates.map(candidate => [candidate])
  const cell = zoom < 13 ? 0.018 : 0.008
  const groups = new Map<string, AreaCandidate[]>()
  candidates.forEach(candidate => {
    const key = `${Math.floor(candidate.location.latitude / cell)}:${Math.floor(candidate.location.longitude / cell)}`
    groups.set(key, [...(groups.get(key) || []), candidate])
  })
  return [...groups.values()]
}

export function MapPicker({ location, onPick, onCandidatePick, areaMode, areaCorners, onAreaCorner, candidates }: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map>(); const marker = useRef<L.Marker>(); const area = useRef<L.Rectangle>(); const candidateLayer = useRef<L.LayerGroup>()
  const [zoom, setZoom] = useState(13)
  const areaModeRef = useRef(areaMode); const onPickRef = useRef(onPick); const onAreaCornerRef = useRef(onAreaCorner); const onCandidatePickRef = useRef(onCandidatePick)
  useEffect(() => { areaModeRef.current = areaMode; onPickRef.current = onPick; onAreaCornerRef.current = onAreaCorner; onCandidatePickRef.current = onCandidatePick }, [areaMode, onPick, onAreaCorner, onCandidatePick])
  useEffect(() => {
    if (!mapElement.current || map.current) return
    map.current = L.map(mapElement.current, { scrollWheelZoom: true }).setView(HALIFAX, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map.current)
    candidateLayer.current = L.layerGroup().addTo(map.current)
    map.current.on('zoomend', () => setZoom(map.current?.getZoom() || 13))
    map.current.on('click', event => { if (areaModeRef.current) onAreaCornerRef.current(event.latlng); else onPickRef.current({ latitude: event.latlng.lat, longitude: event.latlng.lng }) })
    return () => { map.current?.remove(); map.current = undefined }
  }, [])
  useEffect(() => {
    if (!map.current || !location) return
    const position: [number, number] = [location.latitude, location.longitude]
    marker.current?.remove(); marker.current = L.marker(position).addTo(map.current).bindPopup('Selected inspection location').openPopup()
    map.current.flyTo(position, Math.max(map.current.getZoom(), 16))
  }, [location])
  useEffect(() => {
    if (!map.current) return
    area.current?.remove()
    if (areaCorners.length === 2) area.current = L.rectangle(L.latLngBounds(areaCorners[0], areaCorners[1]), { color: '#d39435', weight: 2, fillOpacity: .08 }).addTo(map.current)
  }, [areaCorners])
  useEffect(() => {
    if (!candidateLayer.current || !map.current) return
    candidateLayer.current.clearLayers()
    clusterCandidates(candidates, zoom).forEach(group => {
      const highest = group.reduce((best, candidate) => severity[candidate.priority] > severity[best.priority] ? candidate : best)
      const centre: [number, number] = [group.reduce((sum, item) => sum + item.location.latitude, 0) / group.length, group.reduce((sum, item) => sum + item.location.longitude, 0) / group.length]
      if (group.length > 1) {
        const icon = L.divIcon({ className: `tree-cluster ${highest.priority.toLowerCase()}`, html: `<span>${group.length}</span>`, iconSize: [38, 38], iconAnchor: [19, 19] })
        L.marker(centre, { icon }).bindTooltip(`${group.length} inspection leads — click to zoom in`).on('click', () => map.current?.flyTo(centre, Math.min(map.current.getZoom() + 2, 16))).addTo(candidateLayer.current!)
        return
      }
      L.circleMarker(centre, { radius: highest.priority === 'HIGH' ? 11 : 8, color: highest.priority === 'HIGH' ? '#a7332b' : highest.priority === 'MEDIUM' ? '#b76c1c' : '#2c7651', weight: 3, fillColor: '#fff', fillOpacity: 1, className: `risk-marker ${highest.priority.toLowerCase()}` }).bindPopup(`<b>${highest.priority} inspection lead</b><br>Click marker to view historical Street View.<br>${highest.summary}`).on('click', () => onCandidatePickRef.current(highest)).addTo(candidateLayer.current!)
    })
  }, [candidates, zoom])
  return <div ref={mapElement} className="map" aria-label="Interactive Halifax location map" />
}
