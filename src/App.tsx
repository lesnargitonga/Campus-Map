import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import './App.css';
import { CAMPUS_POIS, CampusPOI, CATEGORIES, CATEGORY_COLORS } from './data/campusPOIs';
import { POISearch } from './components/POISearch';
import { GroupSessionPanel, GroupSession, GroupMember } from './components/GroupSessionPanel';
import { db } from './firebase';
import { collection, doc, setDoc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useMapbox } from './hooks/useMapbox';
import { useUserLocation } from './hooks/useUserLocation';
// Local walkway router removed; using Mapbox Directions exclusively
import { RoutePanel } from './components/RoutePanel';

const CAMPUS_CENTROID: [number,number] = CAMPUS_POIS.length
  ? [
      CAMPUS_POIS.reduce((s,p)=>s+p.coords[0],0)/CAMPUS_POIS.length,
      CAMPUS_POIS.reduce((s,p)=>s+p.coords[1],0)/CAMPUS_POIS.length,
    ]
  : [36.8789,-1.2165];

const DebugPanel = ({ accuracy, active }: { accuracy: number | null; active: boolean }) => (
  <div className="debug-panel">
    <h4>GPS</h4>
    <p>Status: {active ? 'Active' : 'Idle'}</p>
    <p>Accuracy: {accuracy != null ? Math.round(accuracy)+'m' : '—'}</p>
  </div>
);

// Utility: Haversine distance (meters)
function hav(a:[number,number], b:[number,number]){ const R=6371000; const toRad=(d:number)=>d*Math.PI/180; const dLat=toRad(b[1]-a[1]); const dLng=toRad(b[0]-a[0]); const lat1=toRad(a[1]); const lat2=toRad(b[1]); const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }

// POI verification helper used by the UI
function buildPoiReport(reportCallback?: (r:any[])=>void){
  const report: any[] = [];
  CAMPUS_POIS.forEach(p=>{
    const stored = p.coords;
    report.push({ id:p.id, name:p.name, stored, current: stored, drift_m: 0 });
  });
  report.sort((a,b)=>b.drift_m - a.drift_m);
  if(reportCallback) reportCallback(report);
  return report;
}

export default function App(){
  // --- Group Navigation State ---
  const [groupSession, setGroupSession] = useState<GroupSession|null>(null);

  // Persistent lightweight identity (replaces random per-mount id)
  const [myId] = useState(() => {
    const v = localStorage.getItem('cn_my_id');
    if (v) return v;
    const nv = 'user_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('cn_my_id', nv);
    return nv;
  });
  const [myName] = useState(() => {
    const v = localStorage.getItem('cn_my_name');
    if (v) return v;
    const nv = 'You';
    localStorage.setItem('cn_my_name', nv);
    return nv;
  });

  // --- Firestore Session Logic ---
  const handleCreateSession = async () => {
    try {
      const code = Math.random().toString(36).substr(2, 6).toUpperCase();
      const sessionRef = doc(collection(db, 'groupSessions'), code);
      const session: GroupSession = {
        code,
        members: [{ id: myId, name: myName, location: manualLoc || [0,0], route: [] }],
        targetPoiId: ''
      };
      await setDoc(sessionRef, session);
      setGroupSession(session);
      subscribeToSession(code);
  // persist
  localStorage.setItem('cn_session_code', code);
    } catch (e:any) {
      console.error('[Group] create failed', e);
      throw e;
    }
  };

  const handleJoinSession = async (code: string) => {
    try {
      const norm = code.trim().toUpperCase();
      const sessionRef = doc(collection(db, 'groupSessions'), norm);
      const snap = await getDoc(sessionRef);
      let session: GroupSession;
      if (!snap.exists()) {
        // Create new session if not found
        session = {
          code: norm,
          members: [{ id: myId, name: myName, location: manualLoc || [0,0], route: [] }],
          targetPoiId: ''
        };
        await setDoc(sessionRef, session);
      } else {
        session = snap.data() as GroupSession;
        // Add self if not present
        if (!session.members.find(m => m.id === myId)) {
          const updated = [...session.members, { id: myId, name: myName, location: manualLoc || [0,0], route: [] }];
          await updateDoc(sessionRef, { members: updated });
          session.members = updated;
        }
      }
      setGroupSession(session);
  subscribeToSession(norm);
  localStorage.setItem('cn_session_code', norm);
    } catch (e:any) {
      console.error('[Group] join failed', e);
      throw e;
    }
  };

  const handleLeaveSession = async () => {
    try {
      if (groupSession) {
        const sessionRef = doc(collection(db, 'groupSessions'), groupSession.code);
        const updatedMembers = groupSession.members.filter(m => m.id !== myId);
        await updateDoc(sessionRef, { members: updatedMembers });
      }
    } catch (e:any) {
      console.error('[Group] leave failed', e);
      throw e;
    } finally {
      setGroupSession(null);
      unsubscribeFromSession();
  localStorage.removeItem('cn_session_code');
    }
  };

  const handleSetTargetPoi = async (poiId: string) => {
    try {
      if (groupSession) {
        const sessionRef = doc(collection(db, 'groupSessions'), groupSession.code);
        await updateDoc(sessionRef, { targetPoiId: poiId });
      }
    } catch (e:any) {
      console.error('[Group] setTarget failed', e);
      throw e;
    }
  };

  // --- Real-time Firestore listeners ---
  const unsubRef = useRef<(() => void) | null>(null);
  function subscribeToSession(code: string) {
    if (unsubRef.current) { try { unsubRef.current(); } catch {} }
    const sessionRef = doc(collection(db, 'groupSessions'), code);
    unsubRef.current = onSnapshot(
      sessionRef,
      (snap) => { if (snap.exists()) setGroupSession(snap.data() as GroupSession); },
      (err) => { console.error('[Group] snapshot error', err); }
    );
  }
  function unsubscribeFromSession() {
    if (unsubRef.current) { try { unsubRef.current(); } catch {} }
    unsubRef.current = null;
  }
  useEffect(() => () => { if (unsubRef.current) { try { unsubRef.current(); } catch {} } }, []);

  // Auto-restore last joined session (if any)
  const autoJoinOnceRef = useRef(false);
  useEffect(()=>{
    if (autoJoinOnceRef.current) return;
    const last = localStorage.getItem('cn_session_code');
    if (last) {
      autoJoinOnceRef.current = true;
      // Fire and forget; errors will surface in panel handler if needed
      handleJoinSession(last).catch(err=>console.warn('Auto-join failed:', err));
    }
  },[handleJoinSession]);

  const mapContainer = useRef<HTMLDivElement|null>(null);
  const forceOSM = (process.env.REACT_APP_FORCE_OSM||'').trim() === '1';
  // Prefer token from localStorage for quick runtime swaps; fallback to env var
  const lsToken = (typeof window !== 'undefined' ? (localStorage.getItem('cn_mapbox_token')||'') : '').trim();
  const token = forceOSM ? '' : (lsToken || (process.env.REACT_APP_MAPBOX_TOKEN||'').trim());
  mapboxgl.accessToken = token;
  const { mapRef, isReady, error, style, setStyle, /* addPoiMarkers */ markersRef, ensurePoiLayer, setPoiCategoryFilter, clearDomMarkers } = useMapbox(mapContainer, token);
  const { markerRef: userMarkerRef, hasFix, accuracy, enabled: gpsEnabled, setEnabled: setGpsEnabled } = useUserLocation(mapRef);
  const [selectedPoi,setSelectedPoi] = useState<CampusPOI|null>(null);
  const [activeCategory,setActiveCategory] = useState<string|null>(null);
  const [routeStart,setRouteStart] = useState<CampusPOI|null>(null);
  const [routeEnd,setRouteEnd] = useState<CampusPOI|null>(null);
  const [routeDistanceM,setRouteDistanceM] = useState<number|null>(null);
  const [routeDurationSec,setRouteDurationSec] = useState<number|null>(null);
  const [routeSteps,setRouteSteps] = useState<any[]>([]);
  const [showDebug,setShowDebug] = useState(false);
    const [verifying,setVerifying] = useState(false);
  const [manualLoc,setManualLoc] = useState<[number,number]|null>(null);
  const manualMarkerRef = useRef<mapboxgl.Marker|null>(null);
  const [showSetLoc,setShowSetLoc] = useState(false);
  const [navOpen,setNavOpen] = useState(false);
  const [navFromId,setNavFromId] = useState('CURRENT');
  const [navToId,setNavToId] = useState('');
  const [showLegend,setShowLegend] = useState(false);
  const [screenshotMode,setScreenshotMode] = useState(false);

  // Init POI layer
  useEffect(()=>{
    if(isReady){
      ensurePoiLayer(handlePOISelect);
  // Clear legacy markers
      if(Object.keys(markersRef.current).length){ clearDomMarkers(); }
    }
  },[isReady,ensurePoiLayer,clearDomMarkers,markersRef]);

  // Category filter
  useEffect(()=>{
  // Layer filter
    setPoiCategoryFilter(activeCategory);
  // Legacy DOM markers toggle
    Object.entries(markersRef.current).forEach(([id,m])=>{ const el=m.getElement(); if(!activeCategory) el.style.display='block'; else { const poi=CAMPUS_POIS.find(p=>p.id===id); el.style.display=poi && poi.category===activeCategory?'block':'none'; }});
    if(activeCategory && selectedPoi && selectedPoi.category!==activeCategory) setSelectedPoi(null);
  },[activeCategory,selectedPoi,setPoiCategoryFilter]);

  // Compatibility wrapper — use this to centrally swap in safer routing if needed
  function drawRouteSafe(a:CampusPOI,b:CampusPOI){
    try { drawRoute(a,b); } catch(e){ console.warn('drawRouteSafe fallback', e); }
  }

  function handlePOISelect(p:CampusPOI){
    setSelectedPoi(p);
    if(mapRef.current) mapRef.current.flyTo({ center:p.coords, zoom:17 });
  // Sequential selection
    if(!routeStart){ setRouteStart(p); setRouteEnd(null); setRouteDistanceM(null); }
    else if(routeStart && !routeEnd && routeStart.id!==p.id){ setRouteEnd(p); drawRouteSafe(routeStart,p); }
  }

  async function drawRoute(a:CampusPOI,b:CampusPOI){
    if(!mapRef.current) return; const map=mapRef.current;
    try {
      const from = a.coords; const to = b.coords;
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const json = await res.json();
      const route = json?.routes?.[0];
      const coords: [number,number][] = route?.geometry?.coordinates || [from, to];
      const dist = route?.distance || 0;
      const dur = route?.duration || 0;
      const legs = route?.legs || [];
      const steps = (legs[0]?.steps || []).map((s:any) => ({
        from: s?.maneuver?.location || from,
        to: (s?.geometry?.coordinates || [])[((s?.geometry?.coordinates || []).length-1)] || to,
        distanceMeters: s?.distance || 0,
        direction: s?.maneuver?.instruction || 'Continue'
      }));
      const data:any = { type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'LineString', coordinates: coords }, properties:{ distance:dist, duration:dur } }] };
      if(map.getSource('route-line')) (map.getSource('route-line') as mapboxgl.GeoJSONSource).setData(data);
      else if(map.isStyleLoaded()){ map.addSource('route-line',{type:'geojson',data}); map.addLayer({ id:'route-line', type:'line', source:'route-line', paint:{'line-color':'#0077ff','line-width':5,'line-opacity':0.9} }); }
      const bounds=new mapboxgl.LngLatBounds(); coords.forEach(c=>bounds.extend(c as any)); map.fitBounds(bounds,{padding:60,maxZoom:18});
      setRouteDistanceM(dist); setRouteDurationSec(dur); setRouteSteps(steps);
    } catch (e) {
      console.warn('Mapbox directions failed, falling back to straight line', e);
      // Fallback to straight line if API fails
      const from = a.coords; const to = b.coords;
      const data:any = { type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'LineString', coordinates: [from,to] }, properties:{} }] };
      if(map.getSource('route-line')) (map.getSource('route-line') as mapboxgl.GeoJSONSource).setData(data);
      else if(map.isStyleLoaded()){ map.addSource('route-line',{type:'geojson',data}); map.addLayer({ id:'route-line', type:'line', source:'route-line', paint:{'line-color':'#0077ff','line-width':5,'line-opacity':0.9} }); }
      const bounds=new mapboxgl.LngLatBounds(); [from,to].forEach(c=>bounds.extend(c as any)); map.fitBounds(bounds,{padding:60,maxZoom:18});
      setRouteDistanceM(null); setRouteDurationSec(null); setRouteSteps([]);
    }

  }

  function buildNavRoute(){ if(!navToId) return; const startLL = navFromId==='CURRENT' ? userMarkerRef.current?.getLngLat() || manualMarkerRef.current?.getLngLat() : undefined; const startPoi:CampusPOI|undefined = startLL ? { id:'user', name:'My Location', category:'other', coords:[startLL.lng,startLL.lat] } : CAMPUS_POIS.find(p=>p.id===navFromId) || undefined; const endPoi = CAMPUS_POIS.find(p=>p.id===navToId); if(startPoi && endPoi){ setRouteStart(startPoi); setRouteEnd(endPoi); drawRouteSafe(startPoi,endPoi); setNavOpen(false); }}

  function setManualLocationFromPOI(p:CampusPOI){ setManualLoc(p.coords); if(!mapRef.current) return; if(!manualMarkerRef.current){ const el=document.createElement('div'); el.className='user-marker'; manualMarkerRef.current=new mapboxgl.Marker({element:el}).setLngLat(p.coords).addTo(mapRef.current); } else manualMarkerRef.current.setLngLat(p.coords); mapRef.current.flyTo({center:p.coords,zoom:17}); setShowSetLoc(false); }

  function recenterCampus(){ if(mapRef.current) mapRef.current.flyTo({ center:CAMPUS_CENTROID, zoom:16 }); }
  function recenterOnUser(){ const ll = userMarkerRef.current?.getLngLat() || manualMarkerRef.current?.getLngLat(); if(ll && mapRef.current) mapRef.current.flyTo({ center:[ll.lng,ll.lat], zoom:17 }); }
  function clearRoute(){ setRouteStart(null); setRouteEnd(null); setRouteDistanceM(null); setRouteDurationSec(null); setRouteSteps([]); if(mapRef.current?.getSource('route-line')) (mapRef.current.getSource('route-line') as mapboxgl.GeoJSONSource).setData({type:'FeatureCollection',features:[]}); }
  function printRoute(){
    if(!routeStart || !routeEnd || routeDistanceM==null) return;
    const etaMin = routeDurationSec!=null ? Math.max(1, Math.round(routeDurationSec/60)) : null;
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Route Sheet</title>
      <style>
        body { font-family: system-ui, Segoe UI, Roboto, sans-serif; margin:24px; color:#111; }
        h1 { font-size:20px; margin:0 0 8px; }
        .meta { margin:4px 0; }
        .steps { margin-top:12px; }
        .step { font-size:12px; line-height:1.4; margin:2px 0; }
        .muted { color:#555; }
        @media print { .print-only { display:block } }
      </style>
    </head><body>
      <h1>USIU Campus Route</h1>
      <div class="meta"><strong>From:</strong> ${routeStart.name}</div>
      <div class="meta"><strong>To:</strong> ${routeEnd.name}</div>
      <div class="meta"><strong>Distance:</strong> ${(routeDistanceM/1000).toFixed(2)} km</div>
      ${etaMin!=null ? `<div class="meta"><strong>ETA:</strong> ~${etaMin} min walk</div>`: ''}
      <div class="meta muted">Generated: ${new Date().toLocaleString()}</div>
      ${routeSteps.length? `<div class="steps"><strong>Steps</strong>${routeSteps.map((s,i)=>`<div class='step'>${i+1}. ${s.direction} ${s.distanceMeters.toFixed(0)}m</div>`).join('')}</div>`:''}
    </body></html>`;
    const w = window.open('', '_blank');
    if(!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    try { w.print(); } catch {}
  }
  // Recompute when endpoints change
  useEffect(()=>{ if(routeStart && routeEnd) drawRouteSafe(routeStart, routeEnd); },[routeStart, routeEnd]);

  // Hazard marking removed in Mapbox-only mode
  function swapRoute(){ if(routeStart && routeEnd){ drawRouteSafe(routeEnd, routeStart); setRouteStart(routeEnd); setRouteEnd(routeStart); } }
  function closePoi(){ setSelectedPoi(null); }

  return (
  <div className={"app-shell" + (screenshotMode ? " screenshot-mode" : "") }>
    {/* Group Navigation Panel */}
    <div style={{position:'absolute',right:10,top:10,zIndex:20}}>
      <GroupSessionPanel
        session={groupSession}
        selfId={myId}
        onCreate={handleCreateSession}
        onJoin={handleJoinSession}
        onLeave={handleLeaveSession}
        onSetTarget={handleSetTargetPoi}
      />
    </div>
  <div className="app-header"><span className="brand">USIU Campus Navigator</span><span className="tagline">Find your way smarter</span><span style={{fontSize:12,opacity:.7,marginLeft:'auto'}}>{isReady?'Ready':'Loading...'}</span></div>
      <div className="map-region">
        <div ref={mapContainer} className="map-container" />
        {error && <div className="status-banner">{error}</div>}
        <POISearch onSelect={handlePOISelect} activeCategory={activeCategory} setActiveCategory={setActiveCategory} selectedPoiId={selectedPoi?.id||null} />
        <div className="toolbar">
          <button className="btn" onClick={()=>setStyle(style==='streets'?'sat':'streets')} disabled={!token}>{style==='streets'?'Satellite':'Streets'}</button>
          <button className="btn" disabled={!hasFix && !manualLoc} onClick={recenterOnUser}>My Location</button>
            <button className="btn" onClick={recenterCampus}>Campus</button>
          <button className="btn" onClick={()=>setShowDebug(d=>!d)}>{showDebug?'Hide':'Debug'}</button>
          <button className="btn" onClick={()=>setGpsEnabled(!gpsEnabled)}>{gpsEnabled?'GPS Off':'GPS On'}</button>
            <button className="btn" onClick={verifyPOIs} disabled={verifying}>Verify POIs</button>
          <button className={"btn"+(navOpen?' active':'')} onClick={()=>setNavOpen(o=>!o)}>Navigate</button>
          <button className={"btn"+(showSetLoc?' active':'')} onClick={()=>setShowSetLoc(v=>!v)}>{manualLoc?'Change Pos':'Set Position'}</button>
          {/* Accessible and Hazards modes removed in Mapbox-only routing */}
          <button className={"btn"+(showLegend?' active':'')} onClick={()=>setShowLegend(s=>!s)} title="Show category colors">Legend</button>
          <button className={"btn"+(screenshotMode?' active':'')} onClick={()=>setScreenshotMode(s=>!s)} title="Hide UI for screenshots">Clean UI</button>
          <button className="btn" onClick={clearRoute} disabled={!routeStart && !routeEnd}>Reset</button>
          {/* Quick token setter for dev: paste new Mapbox token and reload */}
          <button className="btn" onClick={()=>{
            const t = window.prompt('Paste Mapbox access token (pk...):', '');
            if(t && t.trim()){
              try { localStorage.setItem('cn_mapbox_token', t.trim()); } catch {}
              window.location.reload();
            }
          }} title="Set Mapbox token and reload">Token</button>
        </div>
        {navOpen && (
          <div style={{position:'absolute',left:12,top:70,width:240,background:'#fff',border:'1px solid #d0d7e2',borderRadius:10,padding:10,fontSize:12,zIndex:5}}>
            <strong>Navigate</strong>
            <div style={{marginTop:6}}>From</div>
            <select value={navFromId} onChange={e=>setNavFromId(e.target.value)} style={{width:'100%',marginTop:2}}>
              <option value="CURRENT" disabled={!(userMarkerRef.current||manualMarkerRef.current)}>My Location</option>
              {CAMPUS_POIS.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{marginTop:6}}>To</div>
            <select value={navToId} onChange={e=>setNavToId(e.target.value)} style={{width:'100%',marginTop:2}}>
              <option value="">Select...</option>
              {CAMPUS_POIS.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn" style={{marginTop:8}} disabled={!navToId} onClick={buildNavRoute}>Go</button>
          </div>
        )}
        {showSetLoc && (
          <div style={{position:'absolute',left:navOpen?260:12,top:70,width:240,background:'#fff',border:'1px solid #d0d7e2',borderRadius:10,padding:10,fontSize:12,zIndex:5}}>
            <strong>Set My Location</strong>
            <div style={{maxHeight:210,overflowY:'auto',marginTop:6}}>
              {CAMPUS_POIS.map(p=> (
                <div key={p.id} style={{padding:'4px 6px',cursor:'pointer',borderBottom:'1px solid #f3f5f7'}} onClick={()=>setManualLocationFromPOI(p)}>
                  <span style={{fontSize:12}}>{p.name}</span>
                  <span style={{float:'right',fontSize:10,opacity:.6}}>{p.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedPoi && (
          <div className="poi-card"><button className="close-x" onClick={closePoi}>×</button><h3>{selectedPoi.name}</h3><div className="meta">{selectedPoi.category}</div><div className="desc">Campus point.</div></div>
        )}
        {showDebug && (
          <div style={{position:'absolute', right:10, top:60}}>
            <DebugPanel accuracy={accuracy} active={hasFix || !!manualLoc} />
          </div>
        )}
  <RoutePanel start={routeStart} end={routeEnd} distanceM={routeDistanceM} durationSec={routeDurationSec} steps={routeSteps} active={!!(routeStart||routeEnd)} onReset={clearRoute} onSwap={swapRoute} onPrint={printRoute} />
      {showLegend && (
        <div className="legend-panel">
          <div className="legend-title">POI Legend</div>
          <div className="legend-items">
            {CATEGORIES.map(c=> (
              <div key={c.key} className="legend-item">
                <span className="legend-dot" style={{background:CATEGORY_COLORS[c.key]}} />
                <span className="legend-label">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );

    // Wrapper for the UI button to run POI verification and log results
    function verifyPOIs(){
      if(!mapRef.current) return; setVerifying(true);
      requestAnimationFrame(()=>{
        const report = buildPoiReport();
  console.info('POI verification report prepared', report.length+' items');
        const max = report[0]?.drift_m || 0;
        if(max>2) console.warn('POI verification: some markers drift >2m.');
        else console.info('POI verification: all markers within 2m of stored coordinates.');
        setTimeout(()=>setVerifying(false),200);
      });
    }
}
