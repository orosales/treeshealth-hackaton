import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AreaCandidate } from './types'

interface Props { location: { latitude: number; longitude: number } | null; focusLocation: { latitude: number; longitude: number } | null; onPick: (location: { latitude: number; longitude: number }) => void; onCandidatePick: (candidate: AreaCandidate) => void; areaMode: boolean; areaCorners: L.LatLng[]; onAreaCorner: (corner: L.LatLng) => void; onAreaSelection: (corners: L.LatLng[]) => void; candidates: AreaCandidate[] }
const HALIFAX: [number, number] = [44.6488, -63.5752]
const severity = { HIGH: 3, MEDIUM: 2, LOW: 1 }
const TREE_GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 7.5 9h2.7L6 15h4v5h4v-5h4l-4.2-6h2.7L12 3Z"/></svg>'

function candidatePopup(candidate: AreaCandidate) {
  const discovered = candidate.source === 'AERIAL_DETECTION'
  const groundLabel = candidate.ground_context_provider === 'MAPILLARY' ? 'Mapillary available' : 'Street View available'
  return `<b>${candidate.priority} inspection lead</b><br>${discovered ? 'Possible tree detected in aerial imagery' : 'Halifax public-tree inventory asset'}${candidate.street_view_available ? ` · ${groundLabel}` : ''}<br>${candidate.summary}`
}

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

export function MapPicker({ location, focusLocation, onPick, onCandidatePick, areaMode, areaCorners, onAreaCorner, onAreaSelection, candidates }: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map>(); const marker = useRef<L.Marker>(); const area = useRef<L.Rectangle>(); const cornerLayer = useRef<L.LayerGroup>(); const candidateLayer = useRef<L.LayerGroup>()
  const [zoom, setZoom] = useState(14)
  const areaModeRef = useRef(areaMode); const onPickRef = useRef(onPick); const onAreaCornerRef = useRef(onAreaCorner); const onAreaSelectionRef = useRef(onAreaSelection); const onCandidatePickRef = useRef(onCandidatePick)
  const candidatesRef = useRef(candidates); candidatesRef.current = candidates
  useEffect(() => { areaModeRef.current = areaMode; onPickRef.current = onPick; onAreaCornerRef.current = onAreaCorner; onAreaSelectionRef.current = onAreaSelection; onCandidatePickRef.current = onCandidatePick }, [areaMode, onPick, onAreaCorner, onAreaSelection, onCandidatePick])
  useEffect(() => {
    if (!mapElement.current || map.current) return
    map.current = L.map(mapElement.current, { scrollWheelZoom: true }).setView(HALIFAX, 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map.current)
    candidateLayer.current = L.layerGroup().addTo(map.current)
    cornerLayer.current = L.layerGroup().addTo(map.current)
    map.current.on('zoomend', () => setZoom(map.current?.getZoom() || 14))
    let suppressClick = false
    map.current.on('click', event => {
      if (suppressClick) { suppressClick = false; return }
      if (areaModeRef.current) onAreaCornerRef.current(event.latlng)
      else onPickRef.current({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    })
    const container = map.current.getContainer()
    let pointerId: number | null = null
    let dragStart: L.LatLng | null = null
    let startPoint: L.Point | null = null
    let dragged = false
    const pointerDown = (event: PointerEvent) => {
      if (!areaModeRef.current || event.button !== 0 || (event.target as Element).closest('.leaflet-control')) return
      pointerId = event.pointerId
      container.setPointerCapture(pointerId)
      startPoint = map.current!.mouseEventToContainerPoint(event)
      dragStart = map.current!.containerPointToLatLng(startPoint)
      dragged = false
      event.preventDefault()
    }
    const pointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId || !dragStart || !startPoint || !map.current) return
      const point = map.current.mouseEventToContainerPoint(event)
      if (point.distanceTo(startPoint) >= 6) dragged = true
      if (dragged) {
        const end = map.current.containerPointToLatLng(point)
        area.current?.remove()
        area.current = L.rectangle(L.latLngBounds(dragStart, end), { color: '#c87816', weight: 3, dashArray: '8 6', fillColor: '#f0ad4e', fillOpacity: .14 }).addTo(map.current)
      }
      event.preventDefault()
    }
    const pointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId || !dragStart || !map.current) return
      const end = map.current.containerPointToLatLng(map.current.mouseEventToContainerPoint(event))
      suppressClick = true
      window.setTimeout(() => { suppressClick = false }, 0)
      if (dragged) onAreaSelectionRef.current([dragStart, end])
      else onAreaCornerRef.current(end)
      if (container.hasPointerCapture(pointerId)) container.releasePointerCapture(pointerId)
      pointerId = null; dragStart = null; startPoint = null; dragged = false
      event.preventDefault()
    }
    container.addEventListener('pointerdown', pointerDown)
    container.addEventListener('pointermove', pointerMove)
    container.addEventListener('pointerup', pointerUp)
    container.addEventListener('pointercancel', pointerUp)
    return () => {
      container.removeEventListener('pointerdown', pointerDown); container.removeEventListener('pointermove', pointerMove); container.removeEventListener('pointerup', pointerUp); container.removeEventListener('pointercancel', pointerUp)
      map.current?.remove(); map.current = undefined
    }
  }, [])
  useEffect(() => {
    if (!map.current) return
    if (areaMode) map.current.dragging.disable()
    else map.current.dragging.enable()
  }, [areaMode])
  useEffect(() => {
    if (map.current && focusLocation) map.current.flyTo([focusLocation.latitude, focusLocation.longitude], Math.max(map.current.getZoom(), 15))
  }, [focusLocation])
  useEffect(() => {
    if (!map.current || !location) return
    const position: [number, number] = [location.latitude, location.longitude]
    const icon = L.divIcon({ className: 'selected-tree-marker', html: `<span class="selected-tree-pin">${TREE_GLYPH}</span>`, iconSize: [44, 48], iconAnchor: [22, 44] })
    const match = candidatesRef.current.find(candidate => candidate.location.latitude === location.latitude && candidate.location.longitude === location.longitude)
    marker.current?.remove(); marker.current = L.marker(position, { icon, zIndexOffset: 1000 }).addTo(map.current).bindPopup(match ? `<i>Selected</i><br>${candidatePopup(match)}` : 'Selected inspection lead').openPopup()
    map.current.flyTo(position, Math.max(map.current.getZoom(), 16))
  }, [location])
  useEffect(() => {
    if (!map.current) return
    area.current?.remove()
    cornerLayer.current?.clearLayers()
    areaCorners.forEach((corner, index) => L.circleMarker(corner, { radius: 7, color: '#ffffff', weight: 3, fillColor: '#c87816', fillOpacity: 1 }).bindTooltip(`Corner ${index + 1}`, { permanent: false }).addTo(cornerLayer.current!))
    if (areaCorners.length === 2) area.current = L.rectangle(L.latLngBounds(areaCorners[0], areaCorners[1]), { color: '#c87816', weight: 3, dashArray: '8 6', fillColor: '#f0ad4e', fillOpacity: .14 }).addTo(map.current)
  }, [areaCorners])
  useEffect(() => {
    if (!candidateLayer.current || !map.current) return
    candidateLayer.current.clearLayers()
    clusterCandidates(candidates, zoom).forEach(group => {
      const highest = group.reduce((best, candidate) => severity[candidate.priority] > severity[best.priority] ? candidate : best)
      const centre: [number, number] = [group.reduce((sum, item) => sum + item.location.latitude, 0) / group.length, group.reduce((sum, item) => sum + item.location.longitude, 0) / group.length]
      if (group.length > 1) {
        const icon = L.divIcon({ className: `tree-cluster ${highest.priority.toLowerCase()}`, html: `${TREE_GLYPH}<span>${group.length}</span>`, iconSize: [42, 42], iconAnchor: [21, 21] })
        L.marker(centre, { icon }).bindTooltip(`${group.length} inspection leads — click to zoom in`).on('click', () => map.current?.flyTo(centre, Math.min(map.current.getZoom() + 2, 16))).addTo(candidateLayer.current!)
        return
      }
      const sourceClass = highest.source === 'AERIAL_DETECTION' ? 'aerial-source' : 'inventory-source'
      const icon = L.divIcon({ className: 'tree-marker-host', html: `<span class="tree-map-pin ${highest.priority.toLowerCase()} ${sourceClass}">${TREE_GLYPH}</span>`, iconSize: [36, 40], iconAnchor: [18, 36] })
      L.marker(centre, { icon }).bindPopup(candidatePopup(highest)).on('click', () => onCandidatePickRef.current(highest)).addTo(candidateLayer.current!)
    })
  }, [candidates, zoom])
  return <div ref={mapElement} className="map" aria-label="Interactive Halifax location map" />
}
