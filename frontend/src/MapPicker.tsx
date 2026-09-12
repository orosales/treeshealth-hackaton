import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AreaCandidate } from './types'

interface Props { location: { latitude: number; longitude: number } | null; onPick: (location: { latitude: number; longitude: number }) => void; onCandidatePick: (candidate: AreaCandidate) => void; areaMode: boolean; areaCorners: L.LatLng[]; onAreaCorner: (corner: L.LatLng) => void; candidates: AreaCandidate[] }
const HALIFAX: [number, number] = [44.6488, -63.5752]

export function MapPicker({ location, onPick, onCandidatePick, areaMode, areaCorners, onAreaCorner, candidates }: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map>(); const marker = useRef<L.Marker>(); const area = useRef<L.Rectangle>(); const candidateLayer = useRef<L.LayerGroup>()
  const areaModeRef = useRef(areaMode); const onPickRef = useRef(onPick); const onAreaCornerRef = useRef(onAreaCorner); const onCandidatePickRef = useRef(onCandidatePick)
  useEffect(() => { areaModeRef.current = areaMode; onPickRef.current = onPick; onAreaCornerRef.current = onAreaCorner; onCandidatePickRef.current = onCandidatePick }, [areaMode, onPick, onAreaCorner, onCandidatePick])
  useEffect(() => {
    if (!mapElement.current || map.current) return
    map.current = L.map(mapElement.current, { scrollWheelZoom: true }).setView(HALIFAX, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map.current)
    candidateLayer.current = L.layerGroup().addTo(map.current)
    map.current.on('click', (event) => { if (areaModeRef.current) onAreaCornerRef.current(event.latlng); else onPickRef.current({ latitude: event.latlng.lat, longitude: event.latlng.lng }) })
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
    if (!candidateLayer.current) return
    candidateLayer.current.clearLayers()
    candidates.forEach(candidate => L.circleMarker([candidate.location.latitude, candidate.location.longitude], { radius: 8, color: candidate.priority === 'HIGH' ? '#a7332b' : candidate.priority === 'MEDIUM' ? '#b76c1c' : '#2c7651', fillOpacity: .9 }).bindPopup(`<b>${candidate.priority} inspection lead</b><br>Click marker to view historical Street View.<br>${candidate.summary}`).on('click', () => onCandidatePickRef.current(candidate)).addTo(candidateLayer.current!))
  }, [candidates])
  return <div ref={mapElement} className="map" aria-label="Interactive Halifax location map" />
}
