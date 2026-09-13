import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { BadgeCheck, Camera, LocateFixed, MapPinned, RotateCcw, Satellite, ScanSearch, Search, TreePine } from 'lucide-react'
import { MapPicker } from './MapPicker'
import type { AerialContext, ApproximateAddress, AreaCandidate, AreaScreening, GroundContext, Result } from './types'

const SCAN_STAGES = ['Finding Halifax public trees', 'Retrieving freshness-aware imagery', 'Screening visible evidence']
const MapIcon = MapPinned
const ScanIcon = ScanSearch
const PinIcon = MapPinned
const CameraIcon = Camera
const SearchIcon = Search
const LocateIcon = LocateFixed
interface LocationResult { label: string; latitude: number; longitude: number }

export default function App() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const [groundContext, setGroundContext] = useState<GroundContext | null>(null)
  const [groundContextStatus, setGroundContextStatus] = useState('')
  const [aerial, setAerial] = useState<AerialContext | null>(null)
  const [aerialStatus, setAerialStatus] = useState('')
  const [address, setAddress] = useState<ApproximateAddress | null>(null)
  const [addressStatus, setAddressStatus] = useState('')
  const [areaMode, setAreaMode] = useState(false)
  const [areaCorners, setAreaCorners] = useState<L.LatLng[]>([])
  const [areaScan, setAreaScan] = useState<AreaScreening | null>(null)
  const [areaLoading, setAreaLoading] = useState(false)
  const [error, setError] = useState('')
  const [scanStage, setScanStage] = useState(0)
  const [fieldImage, setFieldImage] = useState<File | null>(null)
  const [fieldResult, setFieldResult] = useState<Result | null>(null)
  const [fieldLoading, setFieldLoading] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [mapFocus, setMapFocus] = useState<{ latitude: number; longitude: number } | null>(null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<LocationResult[]>([])
  const [placeLoading, setPlaceLoading] = useState(false)
  const fieldPreview = useMemo(() => fieldImage ? URL.createObjectURL(fieldImage) : '', [fieldImage])

  useEffect(() => () => { if (fieldPreview) URL.revokeObjectURL(fieldPreview) }, [fieldPreview])

  useEffect(() => {
    if (!areaLoading) { setScanStage(0); return }
    const timer = window.setInterval(() => setScanStage(stage => Math.min(stage + 1, SCAN_STAGES.length - 1)), 1500)
    return () => window.clearInterval(timer)
  }, [areaLoading])

  const chooseLocation = useCallback(async (value: { latitude: number; longitude: number }) => {
    setLocation(value); setError(''); setGroundContext(null); setAerial(null); setAddress(null); setFieldImage(null); setFieldResult(null); setFieldError('')
    setGroundContextStatus('Finding newest available street-level image…'); setAerialStatus('Loading aerial context…'); setAddressStatus('Looking up nearest address…')
    await Promise.all([
      (async () => { try { const response = await fetch(`/api/ground-context?latitude=${value.latitude}&longitude=${value.longitude}`); if (!response.ok) throw new Error(); setGroundContext(await response.json()); setGroundContextStatus('') } catch { setGroundContextStatus('No nearby Mapillary or Google Street View image is available.') } })(),
      (async () => { try { const response = await fetch(`/api/geonova/image?latitude=${value.latitude}&longitude=${value.longitude}`); if (!response.ok) throw new Error(); setAerial(await response.json()); setAerialStatus('') } catch { setAerialStatus('GeoNOVA aerial imagery is unavailable for this location.') } })(),
      (async () => { try { const response = await fetch(`/api/location/address?latitude=${value.latitude}&longitude=${value.longitude}`); if (!response.ok) throw new Error(); setAddress(await response.json()); setAddressStatus('') } catch { setAddressStatus('Approximate nearest address unavailable.') } })(),
    ])
  }, [])

  const chooseCandidate = useCallback((candidate: AreaCandidate) => { void chooseLocation(candidate.location) }, [chooseLocation])
  const useGoogleFallback = useCallback(async () => {
    if (!location || groundContext?.provider !== 'MAPILLARY') { setGroundContext(null); setGroundContextStatus('Street-level image could not be displayed.'); return }
    try {
      const response = await fetch(`/api/ground-context?latitude=${location.latitude}&longitude=${location.longitude}&google_fallback=true`)
      if (!response.ok) throw new Error()
      setGroundContext(await response.json()); setGroundContextStatus('')
    } catch { setGroundContext(null); setGroundContextStatus('Mapillary image failed and Google fallback is unavailable.') }
  }, [location, groundContext])
  const isSelectedCandidate = (candidate: AreaCandidate) => Boolean(location && Math.abs(location.latitude - candidate.location.latitude) < .000001 && Math.abs(location.longitude - candidate.location.longitude) < .000001)
  const selectedCandidate = areaScan?.screened.find(isSelectedCandidate)
  useEffect(() => {
    // Scroll only inside the drawer so the page (and the map popup) stays put
    const drawer = drawerRef.current
    const row = drawer?.querySelector<HTMLElement>('.lead-row.selected')
    if (!drawer || !row || drawer.scrollHeight <= drawer.clientHeight) return
    const rowTop = row.getBoundingClientRect().top - drawer.getBoundingClientRect().top + drawer.scrollTop
    drawer.scrollTo({ top: rowTop - drawer.clientHeight / 2 + row.offsetHeight / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [selectedCandidate])
  const counts = useMemo(() => areaScan?.screened.reduce((total, item) => ({ ...total, [item.priority]: total[item.priority] + 1 }), { HIGH: 0, MEDIUM: 0, LOW: 0 }) ?? { HIGH: 0, MEDIUM: 0, LOW: 0 }, [areaScan])
  const areaSize = useMemo(() => {
    if (areaCorners.length !== 2) return ''
    const middleLatitude = (areaCorners[0].lat + areaCorners[1].lat) / 2
    const middleLongitude = (areaCorners[0].lng + areaCorners[1].lng) / 2
    const width = L.latLng(middleLatitude, areaCorners[0].lng).distanceTo(L.latLng(middleLatitude, areaCorners[1].lng))
    const height = L.latLng(areaCorners[0].lat, middleLongitude).distanceTo(L.latLng(areaCorners[1].lat, middleLongitude))
    const format = (metres: number) => metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
    return `${format(width)} × ${format(height)}`
  }, [areaCorners])
  const addAreaCorner = useCallback((corner: L.LatLng) => { setAreaCorners(previous => previous.length === 1 ? [previous[0], corner] : [corner]); setAreaScan(null); setError('') }, [])
  const selectArea = useCallback((corners: L.LatLng[]) => { setAreaCorners(corners); setAreaScan(null); setError('') }, [])
  const beginArea = () => { setAreaMode(true); setAreaCorners([]); setAreaScan(null); setError('') }
  const cancelArea = () => { setAreaMode(false); setAreaCorners([]); setError('') }
  const resetArea = () => { setAreaMode(true); setAreaCorners([]); setAreaScan(null); setError('') }

  async function searchPlaces() {
    if (placeQuery.trim().length < 2) { setError('Enter a Halifax neighbourhood or address.'); return }
    setPlaceLoading(true); setError(''); setPlaceResults([])
    try {
      const response = await fetch(`/api/location/search?q=${encodeURIComponent(placeQuery.trim())}`)
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Place search is unavailable.')
      setPlaceResults(body.results || [])
      if (!body.results?.length) setError('No matching place was found inside Halifax Regional Municipality.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Place search is unavailable.') }
    finally { setPlaceLoading(false) }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setError('Location is not supported by this browser.'); return }
    setError('')
    navigator.geolocation.getCurrentPosition(position => {
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      if (next.latitude < 44.3 || next.latitude > 45 || next.longitude < -64.1 || next.longitude > -63.3) { setError('Your current location is outside Halifax Regional Municipality.'); return }
      setMapFocus(next); setPlaceQuery('Current location'); setPlaceResults([])
    }, () => setError('Location access was unavailable. You can search for a Halifax place instead.'), { enableHighAccuracy: false, timeout: 8000 })
  }

  async function screenArea() {
    if (areaCorners.length !== 2) { setError('Choose two opposite corners of a scan area.'); return }
    const south = Math.min(areaCorners[0].lat, areaCorners[1].lat), north = Math.max(areaCorners[0].lat, areaCorners[1].lat)
    const west = Math.min(areaCorners[0].lng, areaCorners[1].lng), east = Math.max(areaCorners[0].lng, areaCorners[1].lng)
    setAreaLoading(true); setError(''); setAreaScan(null)
    try {
      const response = await fetch('/api/area-screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ south, west, north, east }) })
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Area screening unavailable. Please retry.')
      setAreaScan(body); setAreaMode(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Area screening unavailable. Please retry.') }
    finally { setAreaLoading(false) }
  }

  async function analyzeFieldEvidence() {
    if (!location || !fieldImage) return
    const form = new FormData(); form.append('latitude', String(location.latitude)); form.append('longitude', String(location.longitude)); form.append('groundImage', fieldImage)
    setFieldLoading(true); setFieldError(''); setFieldResult(null)
    try {
      const response = await fetch('/api/tree-analysis', { method: 'POST', body: form })
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Photo analysis unavailable.')
      setFieldResult(body)
    } catch (cause) { setFieldError(cause instanceof Error ? cause.message : 'Photo analysis unavailable.') }
    finally { setFieldLoading(false) }
  }

  return <main>
    <header className="app-header">
      <div className="brand-mark"><TreePine aria-hidden="true" /></div><div className="brand-copy"><p className="eyebrow">HALIFAX URBAN FOREST</p><h1>TreeSight</h1></div>
      <div className="system-status"><i /> Screening system online</div>
    </header>

    <section className="hero"><div><p className="eyebrow">SMARTER FIELD INSPECTIONS</p><h2>See which trees<br /><span>need attention first.</span></h2><p className="hero-copy">Combine official inventory, aerial discovery, the newest available street imagery, and current field evidence.</p></div><div className="hero-badge" aria-hidden="true"><MapIcon /><span>Public tree<br />screening</span></div></section>

    <section className="map-workspace">
      <div className="map-card">
        <div className="map-toolbar">
          <div className="toolbar-heading"><span className="icon-box"><MapIcon /></span><div><h2>Screen an area</h2><p>Draw an area up to 5 km across, then select a lead.</p></div></div>
          <div className="area-actions">
            {!areaMode && <button className="primary-action" onClick={beginArea}><ScanIcon /> Draw scan area</button>}
            {areaMode && <><div className="step-hint"><b>{areaCorners.length === 2 ? '✓' : '↗'}</b><span>{areaCorners.length === 2 ? `${areaSize} selected` : 'Drag on the map or tap two corners'}</span></div><button className="ghost-action" onClick={cancelArea}>Cancel</button><button className="primary-action" onClick={screenArea} disabled={areaLoading || areaCorners.length !== 2}><ScanIcon /> {areaLoading ? 'Screening…' : 'Screen area'}</button></>}
          </div>
        </div>
        <div className="map-utility-bar">
          <form className="place-search" onSubmit={event => { event.preventDefault(); void searchPlaces() }}>
            <SearchIcon /><input value={placeQuery} onChange={event => { setPlaceQuery(event.target.value); setPlaceResults([]) }} placeholder="Search neighbourhood or address" aria-label="Search Halifax neighbourhood or address" /><button type="submit" disabled={placeLoading}>{placeLoading ? 'Searching…' : 'Search'}</button>
            {placeResults.length > 0 && <div className="place-results">{placeResults.map(result => <button type="button" key={`${result.latitude}-${result.longitude}`} onClick={() => { setMapFocus({ latitude: result.latitude, longitude: result.longitude }); setPlaceQuery(result.label.split(',')[0]); setPlaceResults([]) }}><PinIcon /><span>{result.label}</span></button>)}</div>}
          </form>
          <button className="utility-action" onClick={useMyLocation}><LocateIcon /> My location</button>
          {(areaCorners.length > 0 || areaScan) && <button className="utility-action reset" onClick={resetArea}><RotateCcw aria-hidden="true" /> Reset area</button>}
        </div>
        <div className={`map-shell${areaMode ? ' drawing' : ''}`}>
          <MapPicker location={location} focusLocation={mapFocus} onPick={chooseLocation} onCandidatePick={chooseCandidate} areaMode={areaMode} areaCorners={areaCorners} onAreaCorner={addAreaCorner} onAreaSelection={selectArea} candidates={areaScan?.screened || []} />
          {!areaScan && !areaMode && !areaLoading && <div className="map-tip"><span><PinIcon /></span><div><b>Start with an area</b><small>Draw a boundary to discover public trees.</small></div></div>}
          {areaMode && <div className="drawing-status"><span>{areaCorners.length === 2 ? areaSize : 'Drag to draw'}</span>{areaCorners.length === 2 ? ' area selected' : ' · tap two corners also works'}</div>}
          {areaScan && <div className="source-legend"><b>Tree source</b><span><i className="inventory" /> HRM inventory</span><span><i className="aerial" /> Aerial discovery</span></div>}
          {areaLoading && <div className="scan-overlay" role="status"><div className="scan-card"><div className="scan-symbol"><ScanIcon /></div><p className="eyebrow">AREA SCAN IN PROGRESS</p><h2>{SCAN_STAGES[scanStage]}</h2><div className="scan-progress"><span style={{ width: `${[30, 62, 88][scanStage]}%` }} /></div><ol>{SCAN_STAGES.map((stage, index) => <li className={index < scanStage ? 'done' : index === scanStage ? 'active' : ''} key={stage}><i>{index < scanStage ? '✓' : index + 1}</i>{stage}</li>)}</ol></div></div>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {areaScan && <aside ref={drawerRef} className="lead-drawer" aria-live="polite">
        <div className="drawer-header"><div><p className="eyebrow">SCAN RESULTS</p><h2>Inspection leads</h2></div><span className="result-total">{areaScan.screened.length}</span></div>
        <div className="result-stats"><span><i className="high" />{counts.HIGH} high</span><span><i className="medium" />{counts.MEDIUM} medium</span><span><i className="low" />{counts.LOW} low</span></div>
        <p className="drawer-summary">{areaScan.inventory_candidates_found} HRM inventory trees · {areaScan.aerial_candidates_found} possible aerial discoveries.</p>
        {areaScan.satellite_context?.status === 'AVAILABLE' && <div className="satellite-context"><Satellite aria-hidden="true" /><span>RECENT AREA COVERAGE</span><b>{areaScan.satellite_context.latest_radar_observation ? `S1 radar ${new Date(areaScan.satellite_context.latest_radar_observation).toLocaleDateString()}` : 'S1 radar unavailable'} · {areaScan.satellite_context.latest_optical_observation ? `S2 optical ${new Date(areaScan.satellite_context.latest_optical_observation).toLocaleDateString()}` : 'S2 optical unavailable'}</b><small>{areaScan.satellite_context.cloud_cover == null ? 'Optical cloud estimate unavailable' : `${Math.round(areaScan.satellite_context.cloud_cover)}% optical cloud cover`} · change model not run</small></div>}
        {areaScan.screened.length ? <ol>{areaScan.screened.map((candidate, index) => { const selected = isSelectedCandidate(candidate); const discovered = candidate.source === 'AERIAL_DETECTION'; const groundLabel = candidate.ground_context_provider === 'MAPILLARY' ? 'Mapillary' : 'Street View'; return <li key={`${candidate.location.latitude}-${candidate.location.longitude}`}><button className={`lead-row${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={() => chooseCandidate(candidate)}><span className={`lead-number ${candidate.priority.toLowerCase()}${discovered ? ' aerial' : ''}`}><TreePine aria-hidden="true" /><small>{index + 1}</small></span><span className="lead-copy"><span className="lead-title"><strong>{candidate.asset_id ? `Tree ${candidate.asset_id}` : `Aerial candidate ${index + 1}`}</strong><b className={`tag ${candidate.priority.toLowerCase()}`}>{candidate.priority}</b></span><span className="source-row"><em className={`source-badge ${discovered ? 'aerial' : 'inventory'}`}>{discovered ? <ScanSearch aria-label="Aerial discovery" /> : <BadgeCheck aria-label="Official inventory" />}{discovered ? 'Aerial discovery' : 'Official inventory'}</em>{candidate.street_view_available && <em className={`source-badge ${candidate.ground_context_provider === 'MAPILLARY' ? 'mapillary' : 'street'}`}><Camera aria-hidden="true" />{groundLabel}</em>}</span><small>{candidate.summary}</small>{selected && <em className="selected-label"><PinIcon /> Selected on map</em>}</span><span className="row-arrow">›</span></button></li> })}</ol> : <div className="empty-state"><MapIcon /><b>No tree candidates found</b><p>Try drawing another area near a public street.</p></div>}
      </aside>}
    </section>

    {location && <section className="tree-detail">
      <div className="detail-header">
        <div className="detail-title"><span className="icon-box"><PinIcon /></span><div><p className="eyebrow">SELECTED TREE</p><h2>{selectedCandidate?.asset_id ? `Tree ${selectedCandidate.asset_id}` : 'Tree context'}</h2></div></div>
        {selectedCandidate && <b className={`priority-pill ${selectedCandidate.priority.toLowerCase()}`}><i /> {selectedCandidate.priority} priority</b>}
      </div>
      <div className="detail-info-strip">
        <div><span>Approximate location</span><strong>{address?.address || addressStatus || 'Location selected on map'}</strong></div>
        <div><span>Coordinates</span><strong className="coordinates">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</strong></div>
        {selectedCandidate && <div><span>AI confidence</span><strong>{Math.round(selectedCandidate.confidence * 100)}%</strong></div>}
      </div>
      <div className="evidence-heading"><div><p className="eyebrow">VISUAL EVIDENCE</p><h3>Freshness-aware evidence</h3></div><span>Source and capture age shown explicitly</span></div>
      <div className="evidence-grid">
        <article className="evidence-card">
          <div className="evidence-label"><span className="evidence-icon"><MapIcon /></span><div><b>Aerial context</b><small>Canopy and surroundings</small></div></div>
          {aerial ? <figure><img src={aerial.imageUrl} onError={() => { setAerial(null); setAerialStatus('GeoNOVA aerial image could not be displayed.') }} alt="GeoNOVA aerial context around the selected tree" /><figcaption><span>{aerial.source}</span><b>{aerial.captureDate || 'Current published layer'}</b></figcaption></figure> : <div className="evidence-placeholder"><MapIcon /><p>{aerialStatus || 'Loading aerial context…'}</p></div>}
        </article>
        <article className="evidence-card">
          <div className="evidence-label"><span className="evidence-icon"><CameraIcon /></span><div><b>Street-level context</b><small>Newest provider image available</small></div>{groundContext && <em className={`freshness ${groundContext.freshness.toLowerCase()}`}>{groundContext.freshness}</em>}</div>
          {groundContext ? <figure><img src={groundContext.imageUrl} onError={() => { void useGoogleFallback() }} alt={`${groundContext.source} context near the selected tree`} /><figcaption><span>{groundContext.source}</span><b>{groundContext.captureDate ? new Date(groundContext.captureDate).toLocaleDateString() : 'Date unavailable'}</b></figcaption></figure> : <div className="evidence-placeholder"><CameraIcon /><p>{groundContextStatus || 'Finding newest available street image…'}</p></div>}
        </article>
      </div>
      {selectedCandidate && <div className="finding-note comparison-note"><span>Screening summary</span><p>{selectedCandidate.summary}</p></div>}
      <section className="field-evidence">
        <div><p className="eyebrow">CURRENT CONFIRMATION</p><h3>Add a phone or drone image</h3><p>Use a recent photo after a storm or when historical imagery is not sufficient.</p></div>
        <div className="field-actions">
          <label className="upload-action"><CameraIcon />{fieldImage ? 'Replace image' : 'Choose or take photo'}<input type="file" accept="image/*" capture="environment" onChange={event => { setFieldImage(event.target.files?.[0] || null); setFieldResult(null); setFieldError('') }} /></label>
          <button className="primary-action" disabled={!fieldImage || fieldLoading} onClick={analyzeFieldEvidence}>{fieldLoading ? 'Analyzing current evidence…' : 'Analyze current evidence'}</button>
        </div>
        {fieldPreview && <img className="field-preview" src={fieldPreview} alt="Current field evidence selected for analysis" />}
        {fieldError && <p className="error" role="alert">{fieldError}</p>}
        {fieldResult && <div className={`field-result ${fieldResult.priority.toLowerCase()}`}><b>{fieldResult.priority} inspection priority</b><p>{fieldResult.findings.summary}</p><small>{fieldResult.recommendation}</small></div>}
      </section>
    </section>}
    <footer><span>TreeSight · Halifax, Nova Scotia</span><span>HRM inventory • GeoNOVA • Mapillary • Street View fallback</span></footer>
  </main>
}
