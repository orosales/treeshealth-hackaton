import { useCallback, useState } from 'react'
import L from 'leaflet'
import { MapPicker } from './MapPicker'
import type { ApproximateAddress, AreaCandidate, AreaScreening, StreetView } from './types'

const DISCLAIMER = 'This tool provides an AI-assisted visual screening only. It does not replace an assessment by a qualified arborist or municipal inspector.'

export default function App() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [streetView, setStreetView] = useState<StreetView | null>(null); const [streetViewStatus, setStreetViewStatus] = useState('')
  const [address, setAddress] = useState<ApproximateAddress | null>(null); const [addressStatus, setAddressStatus] = useState('')
  const [areaMode, setAreaMode] = useState(false); const [areaCorners, setAreaCorners] = useState<L.LatLng[]>([]); const [areaScan, setAreaScan] = useState<AreaScreening | null>(null); const [areaLoading, setAreaLoading] = useState(false)
  const [error, setError] = useState('')
  const chooseLocation = useCallback(async (value: { latitude: number; longitude: number }) => {
    setLocation(value); setError(''); setStreetView(null); setStreetViewStatus('Looking for historical Street View…'); setAddress(null); setAddressStatus('Looking up nearest address…')
    try {
      const response = await fetch(`/api/streetview?latitude=${value.latitude}&longitude=${value.longitude}`)
      if (!response.ok) throw new Error()
      setStreetView(await response.json()); setStreetViewStatus('')
    } catch { setStreetViewStatus('Historical Street View is unavailable here or has not been configured.') }
    try {
      const response = await fetch(`/api/location/address?latitude=${value.latitude}&longitude=${value.longitude}`)
      if (!response.ok) throw new Error()
      setAddress(await response.json()); setAddressStatus('')
    } catch { setAddressStatus('Approximate nearest address unavailable.') }
  }, [])
  const chooseCandidate = useCallback((candidate: AreaCandidate) => { void chooseLocation(candidate.location) }, [chooseLocation])
  const addAreaCorner = useCallback((corner: L.LatLng) => { setAreaCorners(previous => previous.length === 1 ? [previous[0], corner] : [corner]); setAreaScan(null); setError('') }, [])
  const beginArea = () => { setAreaMode(true); setAreaCorners([]); setAreaScan(null); setError('') }
  async function screenArea() {
    if (areaCorners.length !== 2) { setError('Choose two opposite corners of a small scan area on the map.'); return }
    const south = Math.min(areaCorners[0].lat, areaCorners[1].lat); const north = Math.max(areaCorners[0].lat, areaCorners[1].lat)
    const west = Math.min(areaCorners[0].lng, areaCorners[1].lng); const east = Math.max(areaCorners[0].lng, areaCorners[1].lng)
    setAreaLoading(true); setError(''); setAreaScan(null)
    try { const response = await fetch('/api/area-screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ south, west, north, east }) }); const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Area screening unavailable. Please retry.'); setAreaScan(body); setAreaMode(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Area screening unavailable. Please retry.') }
    finally { setAreaLoading(false) }
  }
  return <main><header><p className="eyebrow">HALIFAX, NOVA SCOTIA</p><h1>Tree inspection priority</h1><p>Use visible evidence to decide which trees deserve a qualified human inspection first.</p></header>
    <p className="disclaimer">{DISCLAIMER}</p>
    <section className="workflow"><div className="panel area-panel"><h2>Screen a Halifax area</h2><p>Draw an area up to about 5 km across to find Halifax Public Trees inventory candidates. Click a result marker to see its address and historical Street View aimed toward the tree point.</p><div className="area-actions"><button className="secondary" onClick={beginArea}>Draw scan area</button>{areaMode && <><span>Click two opposite map corners.</span><button onClick={screenArea} disabled={areaLoading}>{areaLoading ? 'Screening up to 8 trees…' : 'Screen selected area'}</button></>}</div><MapPicker location={location} onPick={chooseLocation} onCandidatePick={chooseCandidate} areaMode={areaMode} areaCorners={areaCorners} onAreaCorner={addAreaCorner} candidates={areaScan?.screened || []} />{error && <p className="error" role="alert">{error}</p>}{location && <p className="coordinates">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>}{address && <p className="address"><b>{address.label}:</b> {address.address}</p>}{addressStatus && location && <p className="context-note">{addressStatus}</p>}{streetView && location && <figure className="streetview"><img src={`/api/streetview/image?latitude=${location.latitude}&longitude=${location.longitude}`} alt="Historical Google Street View context aimed toward selected tree location" /><figcaption>{streetView.source} · {streetView.captureDate || 'Capture date unavailable'} · Aimed toward the selected tree point · Historical context only</figcaption></figure>}{streetViewStatus && location && <p className="context-note">{streetViewStatus}</p>}</div></section>
    {areaScan && <section className="area-results" aria-live="polite"><h2>Area screening leads</h2><p>Found {areaScan.candidates_found} candidates from the {areaScan.candidate_source}; screened {areaScan.screened.length}. These are visual screening leads, not confirmed hazards.</p>{areaScan.screened.length ? <ol>{areaScan.screened.map((candidate: AreaCandidate, index) => <li key={`${candidate.location.latitude}-${candidate.location.longitude}`}><b className={`tag ${candidate.priority.toLowerCase()}`}>{candidate.priority}</b> <strong>Lead {index + 1}</strong>{candidate.asset_id && ` · Tree ${candidate.asset_id}`} — {candidate.summary} <span>({candidate.location.latitude.toFixed(5)}, {candidate.location.longitude.toFixed(5)})</span></li>)}</ol> : <p>No Halifax Public Trees inventory points were available in this selected area. This dataset primarily covers municipal and right-of-way trees.</p>}</section>}
  </main>
}
