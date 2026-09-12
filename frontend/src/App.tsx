import { useCallback, useEffect, useState } from 'react'
import L from 'leaflet'
import { MapPicker } from './MapPicker'
import type { ApproximateAddress, AreaCandidate, AreaScreening, StreetView } from './types'

const DISCLAIMER = 'This tool provides an AI-assisted visual screening only. It does not replace an assessment by a qualified arborist or municipal inspector.'
const SCAN_STAGES = ['Finding Halifax public trees', 'Retrieving aerial and Street View context', 'Screening visible evidence']

export default function App() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [streetView, setStreetView] = useState<StreetView | null>(null); const [streetViewStatus, setStreetViewStatus] = useState('')
  const [address, setAddress] = useState<ApproximateAddress | null>(null); const [addressStatus, setAddressStatus] = useState('')
  const [areaMode, setAreaMode] = useState(false); const [areaCorners, setAreaCorners] = useState<L.LatLng[]>([]); const [areaScan, setAreaScan] = useState<AreaScreening | null>(null); const [areaLoading, setAreaLoading] = useState(false); const [error, setError] = useState('')
  const [scanStage, setScanStage] = useState(0)
  useEffect(() => {
    if (!areaLoading) { setScanStage(0); return }
    const timer = window.setInterval(() => setScanStage(stage => Math.min(stage + 1, SCAN_STAGES.length - 1)), 1500)
    return () => window.clearInterval(timer)
  }, [areaLoading])
  const chooseLocation = useCallback(async (value: { latitude: number; longitude: number }) => {
    setLocation(value); setError(''); setStreetView(null); setAddress(null); setStreetViewStatus('Loading historical Street View…'); setAddressStatus('Looking up nearest address…')
    try { const response = await fetch(`/api/streetview?latitude=${value.latitude}&longitude=${value.longitude}`); if (!response.ok) throw new Error(); setStreetView(await response.json()); setStreetViewStatus('') } catch { setStreetViewStatus('Historical Street View is unavailable here or has not been configured.') }
    try { const response = await fetch(`/api/location/address?latitude=${value.latitude}&longitude=${value.longitude}`); if (!response.ok) throw new Error(); setAddress(await response.json()); setAddressStatus('') } catch { setAddressStatus('Approximate nearest address unavailable.') }
  }, [])
  const chooseCandidate = useCallback((candidate: AreaCandidate) => { void chooseLocation(candidate.location) }, [chooseLocation])
  const isSelectedCandidate = (candidate: AreaCandidate) => Boolean(location && Math.abs(location.latitude - candidate.location.latitude) < 0.000001 && Math.abs(location.longitude - candidate.location.longitude) < 0.000001)
  const addAreaCorner = useCallback((corner: L.LatLng) => { setAreaCorners(previous => previous.length === 1 ? [previous[0], corner] : [corner]); setAreaScan(null); setError('') }, [])
  const beginArea = () => { setAreaMode(true); setAreaCorners([]); setAreaScan(null); setError('') }
  async function screenArea() {
    if (areaCorners.length !== 2) { setError('Choose two opposite corners of a scan area.'); return }
    const south = Math.min(areaCorners[0].lat, areaCorners[1].lat); const north = Math.max(areaCorners[0].lat, areaCorners[1].lat); const west = Math.min(areaCorners[0].lng, areaCorners[1].lng); const east = Math.max(areaCorners[0].lng, areaCorners[1].lng)
    setAreaLoading(true); setError(''); setAreaScan(null)
    try { const response = await fetch('/api/area-screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ south, west, north, east }) }); const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Area screening unavailable. Please retry.'); setAreaScan(body); setAreaMode(false) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Area screening unavailable. Please retry.') } finally { setAreaLoading(false) }
  }
  return <main><header><p className="eyebrow">HALIFAX, NOVA SCOTIA</p><h1>Tree inspection priority</h1><p>Visual screening leads for professional inspection.</p></header><p className="disclaimer">{DISCLAIMER}</p>
    <section className="map-workspace"><div className="map-card"><div className="map-toolbar"><div><h2>Screen an area</h2><p>Draw up to 5 km across. Click a marker to inspect its context.</p></div><div className="area-actions"><button className="secondary" onClick={beginArea}>Draw scan area</button>{areaMode && <><span>Click two map corners.</span><button onClick={screenArea} disabled={areaLoading}>{areaLoading ? 'Screening up to 8 trees…' : 'Screen selected area'}</button></>}</div></div><MapPicker location={location} onPick={chooseLocation} onCandidatePick={chooseCandidate} areaMode={areaMode} areaCorners={areaCorners} onAreaCorner={addAreaCorner} candidates={areaScan?.screened || []} />{areaLoading && <div className="scan-overlay" role="status"><div className="scan-card"><p className="eyebrow">AREA SCAN IN PROGRESS</p><h2>{SCAN_STAGES[scanStage]}</h2><div className="scan-progress"><span style={{ width: `${[30, 62, 88][scanStage]}%` }} /></div><ol>{SCAN_STAGES.map((stage, index) => <li className={index < scanStage ? 'done' : index === scanStage ? 'active' : ''} key={stage}>{index < scanStage ? '✓' : index + 1} {stage}</li>)}</ol></div></div>}{error && <p className="error" role="alert">{error}</p>}</div>{areaScan && <aside className="lead-drawer" aria-live="polite"><p className="eyebrow">SCAN RESULTS</p><h2>Inspection leads</h2><p className="drawer-summary">{areaScan.screened.length} screened from {areaScan.candidates_found} public-tree candidates.</p>{areaScan.screened.length ? <ol>{areaScan.screened.map((candidate, index) => { const selected = isSelectedCandidate(candidate); return <li key={`${candidate.location.latitude}-${candidate.location.longitude}`}><button className={`lead-row${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={() => chooseCandidate(candidate)}><b className={`tag ${candidate.priority.toLowerCase()}`}>{candidate.priority}</b><span><strong>Lead {index + 1}</strong>{candidate.asset_id && ` · Tree ${candidate.asset_id}`}{selected && <em className="selected-label">Selected</em>}<small>{candidate.summary}</small></span></button></li> })}</ol> : <p>No public-tree inventory points were available in this area.</p>}</aside>}</section>
    {location && <section className="tree-detail"><p className="eyebrow">SELECTED TREE</p><h2>Tree context</h2><p className="coordinates">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>{address && <p className="address"><b>{address.label}:</b> {address.address}</p>}{addressStatus && <p className="context-note">{addressStatus}</p>}{streetView && <figure className="streetview"><img src={`/api/streetview/image?latitude=${location.latitude}&longitude=${location.longitude}`} alt="Historical Google Street View context aimed toward selected tree location" /><figcaption>{streetView.source} · {streetView.captureDate || 'Capture date unavailable'} · Aimed toward the selected tree point · Historical context only</figcaption></figure>}{streetViewStatus && <p className="context-note">{streetViewStatus}</p>}</section>}</main>
}
