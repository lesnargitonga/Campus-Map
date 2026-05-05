import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { CAMPUS_POIS, CATEGORY_COLORS, CampusPOI, CATEGORIES } from './data/campusPOIs';
import LostFoundPanel from './components/LostFoundPanel';
import { db } from './firebase';
import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// Fresh minimal app — Mapbox only
export default function FreshApp() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [err, setErr] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [styleKey, setStyleKey] = useState<'streets'|'sat'>(() => {
    try { const v = localStorage.getItem('cn_style_key'); if (v==='streets' || v==='sat') return v; } catch {}
    return 'streets';
  });
  const [styleVersion, setStyleVersion] = useState(0);
  const schoolDefault: [number, number] = [36.8789, -1.2165];
  const [schoolLL, setSchoolLL] = useState<[number,number]>(() => {
    try { const v = localStorage.getItem('school_ll'); if (v) { const o = JSON.parse(v); if (Array.isArray(o) && o.length===2) return [Number(o[0]), Number(o[1])] as [number,number]; } } catch {}
    return schoolDefault;
  });
  const schoolMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [poiId, setPoiId] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [poiCount, setPoiCount] = useState(0);
  const poiPopupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const focusMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const [showLF, setShowLF] = useState(false);
  // Sidebar tabs
  const tabs = ['Home','Groups','Campus','Map','Location','Lost+Found','Emergency'] as const;
  type Tab = typeof tabs[number];
  const [activeTab, setActiveTab] = useState<Tab>('Groups');
  const [tabHistory, setTabHistory] = useState<Tab[]>([]);
  function openTab(t: Tab){ if(t===activeTab) return; setTabHistory(h=>[...h, activeTab]); setActiveTab(t); }
  function goBack(){ setTabHistory(h=>{ if(h.length===0){ setActiveTab('Home'); return h; } const prev = h[h.length-1]; setActiveTab(prev); return h.slice(0,-1); }); }
  // Simple route builder state
  const [navFromId, setNavFromId] = useState('CURRENT');
  const [navToId, setNavToId] = useState('');
  const lastRouteGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  // Mapbox-only routing now
  // Group Navigation (activities)
  type GroupMember = { id: string; name: string; location: [number, number]; route: string[] };
  type GroupTask = { id: string; text: string; done: boolean; status?: 'todo'|'doing'|'done'; by?: string; ts?: any };
  type GroupSession = { code: string; members: GroupMember[]; targetPoiId: string; name?: string; createdAt?: any; lastActiveAt?: any; tasks?: GroupTask[] };
  const [groupSession, setGroupSession] = useState<GroupSession | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [sessionMsg, setSessionMsg] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [targetPoiId, setTargetPoiId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [browseGroups, setBrowseGroups] = useState<GroupSession[]>([]);
  const [shareLocation, setShareLocation] = useState<boolean>(() => {
    try { const v = localStorage.getItem('cn_share_location'); if (v===null) return true; return v === '1'; } catch { return true; }
  });
  const [autoRoute, setAutoRoute] = useState<boolean>(() => {
    try { const v = localStorage.getItem('cn_auto_route'); if (v===null) return false; return v === '1'; } catch { return false; }
  });
  const [previewGroup, setPreviewGroup] = useState<GroupSession | null>(null);
  // Emergency hazards & routing prefs
  // Hazard tuple: [lng, lat, radiusM?, severity?]
  const [hazards, setHazards] = useState<Array<[number,number,number?,number?]>>(()=>{ try { const v = localStorage.getItem('cn_hazards'); return v? JSON.parse(v) : []; } catch { return []; } });
  const [hazardAdd, setHazardAdd] = useState(false);
  const [avoidHazards, setAvoidHazards] = useState(true);
  const [emergencyTargetId, setEmergencyTargetId] = useState('');
  const [hazardRadiusM, setHazardRadiusM] = useState<number>(()=>{ try { const v = Number(localStorage.getItem('cn_hazard_radius')||'35'); return v>0? v : 35; } catch { return 35; } });
  // Safer routing policy
  const HAZARD_REROUTE_THRESHOLD = 4; // reroute when hazards >= 4 (generally)
  const MAX_LEN_INCREASE_MINOR = 0.12; // <=12% longer allowed when hazards < threshold
  const MAX_LEN_INCREASE_ZERO  = 0.20; // <=20% allowed if we reach zero hazards
  const MAX_LEN_INCREASE_MAJOR = 0.35; // <=35% allowed when hazards >= threshold
  const [myId] = useState(() => {
    const v = localStorage.getItem('cn_my_id'); if (v) return v; const nv = 'user_' + Math.random().toString(36).slice(2,10); localStorage.setItem('cn_my_id', nv); return nv;
  });
  const [myName, setMyName] = useState(() => {
    const v = localStorage.getItem('cn_my_name'); if (v) return v; localStorage.setItem('cn_my_name', 'You'); return 'You';
  });
  const [myLL, setMyLL] = useState<[number,number] | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string|null>(null);
  const [gpsAutoStart, setGpsAutoStart] = useState<boolean>(()=>{
    try { const v = localStorage.getItem('cn_gps_autostart'); if (v===null) return false; return v==='1'; } catch { return false; }
  });

  // Start GPS by default (if supported) so "My Location" reflects the real device position
  useEffect(() => {
    if (gpsAutoStart && !gpsActive && typeof navigator !== 'undefined' && !!navigator.geolocation) {
      // intentionally not adding deps to avoid re-trigger; toggleGPS is stable here
      toggleGPS();
    }
    // note: do not add dependencies here to keep a one-time init
  }, []);

  // Token: localStorage first, then env
  const token = (() => {
    const ls = (typeof window !== 'undefined' ? localStorage.getItem('cn_mapbox_token') || '' : '').trim();
    const env = (process.env.REACT_APP_MAPBOX_TOKEN || '').trim();
    return (ls || env);
  })();
  (mapboxgl as any).accessToken = token;

  // Create map once when token available
  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    if (!token) { setStatus('error'); setErr('Mapbox token missing. Click Set Token.'); return; }
    if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) { setStatus('error'); setErr('WebGL not supported.'); return; }
    const style = styleKey === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/satellite-streets-v12';
    const map = new mapboxgl.Map({ container: ref.current, style, center: schoolLL, zoom: 16 });
    mapRef.current = map;
    const onLoad = () => { setStatus('ready'); setErr(''); setNote(''); setMapReady(true); };
    map.on('load', onLoad);
    map.on('style.load', () => setStyleVersion(v=>v+1));
    map.on('error', (e:any) => { const m = e?.error?.message || e?.message || String(e); setStatus('error'); setErr(m); });
    return () => { try { map.remove(); } catch {} finally { mapRef.current = null; } };
  }, [token]);

  // Persist hazards
  useEffect(()=>{ try { localStorage.setItem('cn_hazards', JSON.stringify(hazards)); } catch {} }, [hazards]);
  useEffect(()=>{ try { localStorage.setItem('cn_hazard_radius', String(hazardRadiusM)); } catch {} }, [hazardRadiusM]);

  // Merge very-close hazards to avoid dense overlapping duplicates (e.g. from imports)
  function mergeCloseHazards(list: Array<[number,number,number?,number?]>, mergeMeters = 8){
    if (!list || list.length<2) return list;
    const used = new Array(list.length).fill(false);
    const out: Array<[number,number,number?,number?]> = [];
    for(let i=0;i<list.length;i++){
      if (used[i]) continue;
      const base = list[i]; used[i]=true;
      const group = [base];
      for(let j=i+1;j<list.length;j++){
        if (used[j]) continue;
        const other = list[j];
        if (haversine([base[0], base[1]], [other[0], other[1]]) <= mergeMeters){ used[j]=true; group.push(other); }
      }
      // merge group into single hazard: average coords, take max radius, max severity
      const sum = group.reduce((acc, v)=>{ acc[0]+=v[0]; acc[1]+=v[1]; return acc; }, [0,0]);
      const avg = [sum[0]/group.length, sum[1]/group.length] as [number,number];
      const maxR = group.reduce((m,v)=>(Math.max(m, v[2]||hazardRadiusM)), 0);
      const maxS = group.reduce((m,v)=>(Math.max(m, v[3]||1)), 0);
      out.push([avg[0], avg[1], maxR || hazardRadiusM, maxS || 1]);
    }
    return out;
  }

  // Run merge once after hazards update to collapse accidental dense duplicates
  useEffect(()=>{
    try{
      const merged = mergeCloseHazards(hazards, 8);
      const a = JSON.stringify(merged || []);
      const b = JSON.stringify(hazards || []);
      if (a !== b) {
        // update only when changes exist
        setHazards(merged as any);
      }
    } catch {}
  }, [hazards]);

  // Ensure hazard layer/source exists and stays updated
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const srcId = 'hazards';
    const data: GeoJSON.FeatureCollection<GeoJSON.Point, any> = {
      type: 'FeatureCollection',
      features: hazards.map(h => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [h[0],h[1]] }, properties: { r: h[2]||hazardRadiusM, s: h[3]||1 } }))
    };
    try {
      if (!map.getSource(srcId)) map.addSource(srcId, { type: 'geojson', data } as any);
      else (map.getSource(srcId) as mapboxgl.GeoJSONSource).setData(data as any);
      if (!map.getLayer('hazard-points')) {
        map.addLayer({ id: 'hazard-points', type: 'circle', source: srcId, paint: { 'circle-radius': 7, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
        // Delete hazard on click
        map.on('click','hazard-points',(e:any)=>{
          const f = e.features?.[0]; if(!f) return; const [lng,lat] = (f.geometry?.coordinates||[]) as [number,number];
          setHazards(h => h.filter(x=> !(Math.abs(x[0]-lng)<1e-6 && Math.abs(x[1]-lat)<1e-6)));
        });
        map.on('mouseenter','hazard-points',()=>{ map.getCanvas().style.cursor='pointer'; });
        map.on('mouseleave','hazard-points',()=>{ map.getCanvas().style.cursor=''; });
      }
      // Hazard area polygons (fill + outline)
      const areaSrcId = 'hazard-areas';
      const areaData: GeoJSON.FeatureCollection<GeoJSON.Polygon, any> = {
        type: 'FeatureCollection',
        features: hazards.map(h => makeCirclePolygon([h[0],h[1]], h[2]||hazardRadiusM))
      } as any;
      if (!map.getSource(areaSrcId)) map.addSource(areaSrcId, { type:'geojson', data: areaData } as any);
      else (map.getSource(areaSrcId) as mapboxgl.GeoJSONSource).setData(areaData as any);
      if (!map.getLayer('hazard-area-fill')) {
        map.addLayer({ id:'hazard-area-fill', type:'fill', source: areaSrcId, paint: { 'fill-color':'#ef4444', 'fill-opacity': 0.18 } });
      }
      if (!map.getLayer('hazard-area-outline')) {
        map.addLayer({ id:'hazard-area-outline', type:'line', source: areaSrcId, paint: { 'line-color':'#ef4444', 'line-width': 1, 'line-opacity': 0.6 } });
      }
    } catch {}
  }, [hazards, mapReady, styleVersion, hazardRadiusM]);

  // Click-to-add hazard when toggled
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
  const onClick = (e: any) => {
    if (!hazardAdd) return;
    try {
      const feats = map.queryRenderedFeatures(e.point, { layers: ['hazard-points'] });
      if (feats && feats.length) return; // clicking a hazard dot -> handled by delete
    } catch {}
    const ll:[number,number] = [e.lngLat.lng, e.lngLat.lat];
    setHazards(h => [...h, [ll[0], ll[1], hazardRadiusM, 1]]);
  };
    map.on('click', onClick);
    return () => { try { map.off('click', onClick); } catch {} };
  }, [hazardAdd, mapReady, hazardRadiusM]);

  // Helper: haversine meters (already below but local copy for early use)
  function haversine(a:[number,number], b:[number,number]){
    const R = 6371000; const toRad=(d:number)=>d*Math.PI/180;
    const dLat = toRad(b[1]-a[1]); const dLng = toRad(b[0]-a[0]);
    const la1 = toRad(a[1]); const la2 = toRad(b[1]);
    const s = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // Build circle polygons to visualize hazard radius
  function destinationPoint(a:[number,number], bearingDeg:number, distM:number): [number,number]{
    const R = 6371000; const toRad=(d:number)=>d*Math.PI/180; const toDeg=(r:number)=>r*180/Math.PI;
    const φ1 = toRad(a[1]); const λ1 = toRad(a[0]); const θ = toRad(bearingDeg); const δ = distM / R;
    const sinφ1=Math.sin(φ1), cosφ1=Math.cos(φ1), sinδ=Math.sin(δ), cosδ=Math.cos(δ), sinθ=Math.sin(θ), cosθ=Math.cos(θ);
    const sinφ2 = sinφ1*cosδ + cosφ1*sinδ*cosθ; const φ2 = Math.asin(Math.min(1, Math.max(-1, sinφ2)));
    const y = sinθ*sinδ*cosφ1; const x = cosδ - sinφ1*sinφ2; const λ2 = λ1 + Math.atan2(y, x);
    return [((toDeg(λ2)+540)%360)-180, toDeg(φ2)];
  }

  function makeCirclePolygon(center:[number,number], radiusM:number, steps=40): GeoJSON.Feature<GeoJSON.Polygon, any> {
    const coords: [number,number][] = [];
    for(let i=0;i<=steps;i++){
      const angle = (i/steps)*360;
      coords.push(destinationPoint(center, angle, Math.max(1, radiusM)));
    }
    return { type:'Feature', geometry:{ type:'Polygon', coordinates:[coords] }, properties:{ r: radiusM } } as any;
  }

  function bearingBetween(a:[number,number], b:[number,number]): number {
    const toRad=(d:number)=>d*Math.PI/180, toDeg=(r:number)=>r*180/Math.PI;
    const φ1 = toRad(a[1]); const φ2 = toRad(b[1]); const Δλ = toRad(b[0]-a[0]);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    const brng = (toDeg(θ)+360)%360;
    return brng;
  }

  // Densify route for reliable hazard sensing (approx. every 10m)
  function densifyLine(coords: [number,number][], stepM=10): [number,number][]{
    if (!coords || coords.length<2) return coords||[];
    const out: [number,number][] = [];
    for(let i=0;i<coords.length-1;i++){
      const a = coords[i]; const b = coords[i+1];
      out.push(a);
      const d = haversine([a[0],a[1]],[b[0],b[1]]);
      const n = Math.max(0, Math.ceil(d/stepM)-1);
      for(let j=1;j<=n;j++){
        const t = j/(n+1);
        out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]);
      }
    }
    out.push(coords[coords.length-1]);
    return out;
  }

  // Project lon/lat to Web Mercator meters
  function merc(lng:number, lat:number): [number,number]{
    const R = 6378137.0; const λ = lng*Math.PI/180; const φ=lat*Math.PI/180;
    const x = R * λ; const y = R * Math.log(Math.tan(Math.PI/4 + φ/2));
    return [x,y];
  }
  function unmerc(x:number, y:number): [number,number]{
    const R = 6378137.0; const λ = x / R; const φ = 2*Math.atan(Math.exp(y/R)) - Math.PI/2; return [λ*180/Math.PI, φ*180/Math.PI];
  }
  function distPointToSegmentMeters(px:number, py:number, x1:number, y1:number, x2:number, y2:number): number{
    const vx = x2-x1, vy = y2-y1; const wx = px-x1, wy = py-y1;
    const c1 = vx*wx + vy*wy; if (c1<=0) return Math.hypot(px-x1, py-y1);
    const c2 = vx*vx + vy*vy; if (c2<=c1) return Math.hypot(px-x2, py-y2);
    const t = c1/c2; const cx = x1 + t*vx; const cy = y1 + t*vy; return Math.hypot(px-cx, py-cy);
  }
  function minDistanceToPolylineMeters(p:[number,number], line:[number,number][]): number{
    if (!line || line.length<2) return Infinity;
    const [px,py] = merc(p[0], p[1]);
    let min = Infinity; let p1 = merc(line[0][0], line[0][1]);
    for(let i=1;i<line.length;i++){
      const p2 = merc(line[i][0], line[i][1]);
      const d = distPointToSegmentMeters(px,py, p1[0],p1[1], p2[0],p2[1]);
      if (d<min) min=d; p1 = p2;
    }
    return min;
  }
  // Count unique hazards touched by a route using precise segment distance
  function countHazardsOnRoute(coords:[number,number][]): number{
    const seen: boolean[] = new Array(hazards.length).fill(false);
    for (let hi=0; hi<hazards.length; hi++){
      const h = hazards[hi]; const rad = (h[2]||hazardRadiusM);
      const d = minDistanceToPolylineMeters([h[0],h[1]], coords);
      if (d <= rad) seen[hi] = true;
    }
    return seen.reduce((a,b)=>a+(b?1:0),0);
  }

  // Grid A* fallback to derive safe guidepoints around hazard fields
  function buildSafeGuidepoints(start:[number,number], end:[number,number], cell=25): [number,number][] | null {
    // Bounds from start/end and hazards
    const pts: [number,number][] = [start, end, ...hazards.map(h=>[h[0],h[1]] as [number,number])];
    const xs = pts.map(p=>merc(p[0],p[1])[0]); const ys = pts.map(p=>merc(p[0],p[1])[1]);
    let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 120; minX-=pad; maxX+=pad; minY-=pad; maxY+=pad;
    const w = Math.max(1, Math.ceil((maxX-minX)/cell)); const hgt = Math.max(1, Math.ceil((maxY-minY)/cell));
    // Cap grid size to keep it light
    if (w*hgt > 60000) return null;
    const block: Uint8Array = new Uint8Array(w*hgt);
    // Mark blocked cells (within any hazard radius + margin)
    for(let gy=0; gy<hgt; gy++){
      for(let gx=0; gx<w; gx++){
        const cx = minX + (gx+0.5)*cell; const cy = minY + (gy+0.5)*cell;
        const [lng,lat] = unmerc(cx,cy);
        let bad=false; for(const hz of hazards){ const r=(hz[2]||hazardRadiusM)+5; if (haversine([lng,lat],[hz[0],hz[1]])<=r){ bad=true; break; } }
        block[gy*w+gx] = bad ? 1 : 0;
      }
    }
    const sn = merc(start[0],start[1]); const en = merc(end[0],end[1]);
    const toIdx = (x:number,y:number)=> y*w+x;
    const clamp = (v:number, lo:number, hi:number)=> Math.max(lo, Math.min(hi, v));
    let sx = clamp(Math.floor((sn[0]-minX)/cell),0,w-1), sy = clamp(Math.floor((sn[1]-minY)/cell),0,hgt-1);
    let ex = clamp(Math.floor((en[0]-minX)/cell),0,w-1), ey = clamp(Math.floor((en[1]-minY)/cell),0,hgt-1);
    if (block[toIdx(sx,sy)]===1 || block[toIdx(ex,ey)]===1) return null;
    // A*
    const open: number[] = []; const came = new Int32Array(w*hgt).fill(-1);
    const g = new Float32Array(w*hgt).fill(Infinity); const f = new Float32Array(w*hgt).fill(Infinity);
    const hfun = (x:number,y:number)=>{
      const dx = (x-ex), dy=(y-ey); return Math.hypot(dx,dy);
    };
    const push = (idx:number)=>{ open.push(idx); };
    const popBest = ()=>{
      let bi=-1, bv=Infinity; for(let i=0;i<open.length;i++){ const v=f[open[i]]; if (v<bv){ bv=v; bi=i; } }
      return bi>=0 ? open.splice(bi,1)[0] : -1;
    };
    const startIdx = toIdx(sx,sy), endIdx = toIdx(ex,ey);
    g[startIdx]=0; f[startIdx]=hfun(sx,sy); push(startIdx);
    const nbs = [[1,0,1],[0,1,1],[-1,0,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]] as const;
    const inOpen = new Uint8Array(w*hgt);
    inOpen[startIdx]=1;
    while(open.length){
      const cur = popBest(); if (cur<0) break; inOpen[cur]=0; if (cur===endIdx) break;
      const cx = cur%w, cy = (cur/w)|0;
      for(const [dx,dy,cost] of nbs){ const nx=cx+dx, ny=cy+dy; if(nx<0||ny<0||nx>=w||ny>=hgt) continue; const ni=toIdx(nx,ny); if(block[ni]===1) continue; const tg = g[cur]+cost; if (tg<g[ni]){ came[ni]=cur; g[ni]=tg; f[ni]=tg + hfun(nx,ny); if(!inOpen[ni]){ push(ni); inOpen[ni]=1; } } }
    }
    if (came[endIdx]===-1) return null;
    // Reconstruct
    const path: [number,number][] = []; let idx = endIdx; while(idx!==-1){ const x = (idx%w), y = (idx/w)|0; const cx = minX + (x+0.5)*cell; const cy = minY + (y+0.5)*cell; path.push(unmerc(cx,cy)); idx = came[idx]; }
    path.reverse();
    // Simplify by sampling every ~8th step and keeping turns
    const keep: [number,number][]= []; const turn=(a:[number,number],b:[number,number],c:[number,number])=>{ const ab=[b[0]-a[0], b[1]-a[1]], bc=[c[0]-b[0], c[1]-b[1]]; const dot = ab[0]*bc[0]+ab[1]*bc[1]; const na=Math.hypot(ab[0],ab[1])||1, nb=Math.hypot(bc[0],bc[1])||1; const cos=dot/(na*nb); return cos<0.98; };
    for(let i=0;i<path.length;i++){ if (i%8===0 || i===0 || i===path.length-1) { keep.push(path[i]); } else if (i>1 && i<path.length-1 && turn(path[i-1], path[i], path[i+1])) { keep.push(path[i]); } }
    // Limit via points count
    const vias = keep.slice(1, -1);
    const step = Math.max(1, Math.ceil(vias.length/6));
    const selected: [number,number][] = []; for(let i=0;i<vias.length;i+=step) selected.push(vias[i]);
    return selected;
  }

  async function drawSafeRoute(start:[number,number], end:[number,number]){
    if (!mapRef.current) return;
    const map = mapRef.current;
    try{
      if (!token) { setNote('Set your Mapbox token to load routes.'); return; }
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&overview=full&alternatives=true&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url); const json = await res.json(); const routes:any[] = json?.routes || [];
      let best = routes[0]; let dist = best?.distance || 0; let dur = best?.duration || 0; let bestHits:number|undefined = undefined;
  if (avoidHazards && hazards.length && routes.length>0){
        // Build scored candidates: hits, distance, duration
        const scored = routes.map(r => {
          const coords:[number,number][] = r?.geometry?.coordinates || [];
          const hits = countHazardsOnRoute(coords);
          return { r, hits, dist: r?.distance||0, dur: r?.duration||0 };
        });
  // Prefer the route with the fewest hazard hits (tie-breaker: distance, duration)
  scored.sort((a,b)=> (a.hits-b.hits) || (a.dist-b.dist) || (a.dur-b.dur));
  // Debug: log scored candidates
  // debug: scored candidates removed for presentation
  const chosen = scored[0];
  best = chosen.r; bestHits = chosen.hits; dist = chosen.dist; dur = chosen.dur;
  // debug: initial chosen removed for presentation

        // If the chosen route still has hazards, aggressively try detours (via probes + grid fallback)
  if ((bestHits ?? 0) > 0) {
          const coords:[number,number][] = best?.geometry?.coordinates || [];
          const isHit = (pt:[number,number]) => hazards.some(h=>haversine([pt[0],pt[1]],[h[0],h[1]]) <= (h[2]||hazardRadiusM));
          const hitsIdx: number[] = [];
          for(let i=0;i<coords.length;i+=3){ if (isHit(coords[i] as any)) hitsIdx.push(i); }
          if (hitsIdx.length){
            const pick = (arr:number[], k:number)=> arr[Math.min(arr.length-1, Math.max(0, k))];
            const iFirst = pick(hitsIdx, 0);
            const iMid   = pick(hitsIdx, Math.floor(hitsIdx.length/2));
            const iLast  = pick(hitsIdx, hitsIdx.length-1);
            const candidates: [number,number][][] = [];
            [iFirst, iMid, iLast].forEach(ii => {
              const p = coords[ii]; const p2 = coords[Math.min(ii+5, coords.length-1)] || end;
              const br = bearingBetween(p as any, p2 as any);
              const base0 = hazardRadiusM + 70;
              const dirs = [(br+90)%360, (br+270)%360];
              dirs.forEach(dbr => {
                let dist = base0; let via = destinationPoint(p as any, dbr, dist);
                let tries = 0;
                while (tries < 4 && hazards.some(h=>haversine(via as any, [h[0],h[1]]) <= (h[2]||hazardRadiusM))) {
                  dist += 50; via = destinationPoint(p as any, dbr, dist); tries++;
                }
                candidates.push([via]);
              });
            });
    for (const [via] of candidates.slice(0,6)){
              try {
                const url2 = `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${via[0]},${via[1]};${end[0]},${end[1]}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
                const res2 = await fetch(url2); const json2 = await res2.json(); const r2 = (json2?.routes||[])[0];
                if (r2){
                  const c2:[number,number][] = r2?.geometry?.coordinates||[];
                  const hits2 = countHazardsOnRoute(c2);
      // Debug: probe result
  // debug: probe via removed for presentation
      // Accept any detour that reduces the number of hazard hits
  if (hits2 < (bestHits ?? 9999)) { best = r2; bestHits = hits2; dist = r2?.distance||dist; dur = r2?.duration||dur; }
                  if ((bestHits ?? 0) === 0) break; // early exit if found safe
                }
              } catch {}
            }
          }
          // Grid-based fallback: compute safe guidepoints and try them
          if ((bestHits ?? 0) > 0){
            const guides = buildSafeGuidepoints(start, end, 30);
            if (guides && guides.length){
              // Try progressive batches of 1..3 via points to keep URL small
              const batches = [1,2,3];
      for(const k of batches){
                const sub = guides.slice(0,k);
                const way = [start, ...sub, end];
                try{
                  const coordsStr = way.map(p=>`${p[0]},${p[1]}`).join(';');
                  const url3 = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordsStr}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
                  const r3 = await fetch(url3).then(r=>r.json()).then(j=>(j?.routes||[])[0]);
                  if (r3){
                    const c3:[number,number][] = r3?.geometry?.coordinates||[];
                    const hits3 = countHazardsOnRoute(c3);
        // Debug: grid guide attempt result
  // debug: guide attempt removed for presentation
        // Accept any alternative that reduces hazard hits
  if (hits3 < (bestHits ?? 9999)) { best = r3; bestHits = hits3; dist = r3?.distance||dist; dur = r3?.duration||dur; }
                    if ((bestHits ?? 0) === 0) break;
                  }
                } catch {}
              }
            }
          }
        }
      }
  // debug: final selection removed for presentation
      const coords:[number,number][] = best?.geometry?.coordinates || [start,end];
      const data: GeoJSON.FeatureCollection = { type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'LineString', coordinates: coords }, properties:{ distance:dist, duration:dur } } as any] } as any;
      lastRouteGeoRef.current = data;
      if (!map.getSource('route-line')) map.addSource('route-line', { type:'geojson', data } as any); else (map.getSource('route-line') as mapboxgl.GeoJSONSource).setData(data as any);
      if (!map.getLayer('route-line')) map.addLayer({ id:'route-line', type:'line', source:'route-line', paint:{ 'line-color':'#10b981','line-width':5,'line-opacity':0.9 } });
      const b = new mapboxgl.LngLatBounds(); coords.forEach(c=>b.extend(c as any)); map.fitBounds(b, { padding: 60, maxZoom: 18 });
      if (avoidHazards && hazards.length){
        // Use precomputed hits if available; else compute quick estimate
  let hits = typeof bestHits==='number' ? bestHits : countHazardsOnRoute(coords);
        const color = hits===0? '#10b981' : hits<4? '#f59e0b' : '#ef4444'; try { map.setPaintProperty('route-line','line-color', color); } catch {}
        const mins = dur>0 ? Math.round(dur/60) : Math.round((dist/1.4)/60);
        const msg = hits===0 ? 'Safe route selected (no hazards)' : `Caution: route passes near ${hits} hazard${hits>1?'s':''}`;
        setNote(`${msg} • ${(dist/1000).toFixed(2)} km, ~${mins} min`);
      }
    } catch(e){ console.warn('drawSafeRoute failed', e); }
  }

  // Add campus POIs as a GeoJSON source/layers with category colors and selection highlight
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const srcId = 'pois';
    const layerId = 'poi-circles';
    const hiId = 'poi-circles-selected';
    const fc: GeoJSON.FeatureCollection<GeoJSON.Point, any> = {
      type: 'FeatureCollection',
      features: CAMPUS_POIS.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p.coords }, properties: { id: p.id, name: p.name, category: p.category } }))
    };
    try {
      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: 'geojson', data: fc } as any);
      } else {
        (map.getSource(srcId) as mapboxgl.GeoJSONSource).setData(fc);
      }
      setPoiCount(CAMPUS_POIS.length);
      const colorExpr: any = (() => {
        const parts: any[] = ['match', ['get', 'category']];
        (Object.keys(CATEGORY_COLORS) as Array<keyof typeof CATEGORY_COLORS>).forEach(k => { parts.push(k, CATEGORY_COLORS[k]); });
        parts.push('#2d7ef7');
        return parts;
      })();
      if (!map.getLayer(layerId)) {
        map.addLayer({ id: layerId, type: 'circle', source: srcId, paint: { 'circle-radius': 7, 'circle-color': colorExpr, 'circle-stroke-width': 2, 'circle-stroke-color': '#0f172a' } });
      }
      if (!map.getLayer(hiId)) {
        map.addLayer({ id: hiId, type: 'circle', source: srcId, paint: { 'circle-radius': 9, 'circle-color': '#ff8800', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }, filter: ['==', 'id', '__none__'] });
      }
    const onClick = (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const id = f.properties?.id;
        setPoiId(id || '');
        map.setFilter(hiId, ['==', 'id', id || '__none__']);
        const p = CAMPUS_POIS.find(pp => pp.id === id);
  if (p) {
          map.flyTo({ center: p.coords, zoom: 18 });
          // Show details popup
          try { if (poiPopupRef.current) { poiPopupRef.current.remove(); poiPopupRef.current = null; } } catch {}
          const catLabel = (CATEGORIES.find(c=>c.key===p.category)?.label) || p.category;
          const tags = p.tags && p.tags.length ? `<div style='margin-top:4px;font-size:11;color:#374151'>${p.tags.join(', ')}</div>` : '';
          const html = `
            <div style='font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:220px'>
              <div style='font-weight:700;font-size:13px;color:#111827'>${p.name}</div>
              <div style='font-size:11px;color:#6b7280'>${catLabel}</div>
              ${p.description ? `<div style='font-size:12px;margin-top:6px;color:#111827'>${p.description}</div>` : ''}
              ${tags}
            </div>`;
      poiPopupRef.current = new mapboxgl.Popup({ offset: 10, closeOnMove: false })
            .setLngLat(p.coords as any)
            .setHTML(html)
            .addTo(map);
          // Focus marker
          showFocusMarker(p.coords as [number,number]);
        }
      };
      map.on('click', layerId, onClick);
    const onEnter = () => { try { map.getCanvas().style.cursor = 'pointer'; } catch {} };
    const onLeave = () => { try { map.getCanvas().style.cursor = ''; } catch {} };
    map.on('mouseenter', layerId, onEnter);
    map.on('mouseleave', layerId, onLeave);
    return () => { try { map.off('click', layerId, onClick); map.off('mouseenter', layerId, onEnter); map.off('mouseleave', layerId, onLeave); } catch {} };
    } catch (e) {
      console.warn('POI layer init failed', e);
    }
  }, [mapReady, styleVersion]);

  // Re-attach route layer after style changes if we have a cached route
  useEffect(() => {
    if (!mapReady || !mapRef.current || !lastRouteGeoRef.current) return;
    const map = mapRef.current;
    const data = lastRouteGeoRef.current as any;
    try {
      if (!map.getSource('route-line')) {
        map.addSource('route-line', { type: 'geojson', data } as any);
      } else {
        (map.getSource('route-line') as mapboxgl.GeoJSONSource).setData(data as any);
      }
      if (!map.getLayer('route-line')) {
        map.addLayer({ id:'route-line', type:'line', source:'route-line', paint:{ 'line-color':'#0077ff','line-width':5,'line-opacity':0.9 } });
      }
    } catch {}
  }, [styleVersion, mapReady]);

  // Removed walkway network debug overlay (Mapbox-only mode)

  // Switch Mapbox style on user toggle
  useEffect(() => {
    if (!mapRef.current) return;
    if (!token) { setNote('Set your Mapbox token to load the map.'); return; }
    const next = styleKey === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/satellite-streets-v12';
    setStatus('loading');
    let timeout: any;
    const onLoad = () => { clearTimeout(timeout); setStatus('ready'); setErr(''); };
    mapRef.current.on('style.load', onLoad);
    try { mapRef.current.setStyle(next); } catch {}
    timeout = setTimeout(() => {
    setStatus('ready');
    setErr('Map style timed out.');
    }, 2000);
    return () => { clearTimeout(timeout); mapRef.current && mapRef.current.off('style.load', onLoad); };
  }, [styleKey, token]);

  // Save style to localStorage when asked
  function saveStyleAsDefault(){ try { localStorage.setItem('cn_style_key', styleKey); setNote('Saved style'); setTimeout(()=>setNote(''), 900); } catch {} }

  // Removed all non-Mapbox fallbacks — Mapbox only mode

  // --- Group session helpers ---
  function subscribeToSession(code: string){
    if (unsubRef.current) { try { unsubRef.current(); } catch {} }
    const ref = doc(collection(db, 'groupSessions'), code);
    unsubRef.current = onSnapshot(ref, (snap)=>{
      if (snap.exists()) {
        const s = snap.data() as GroupSession; setGroupSession(s); setTargetPoiId(s.targetPoiId||'');
      }
    }, (err)=>{ setSessionMsg(err?.message||'Session error'); });
  }
  function unsubscribeFromSession(){ if (unsubRef.current) { try { unsubRef.current(); } catch {} } unsubRef.current=null; }
  useEffect(()=>()=>{ unsubscribeFromSession(); },[]);

  // Persist toggles
  useEffect(()=>{ try { localStorage.setItem('cn_share_location', shareLocation ? '1' : '0'); } catch {} }, [shareLocation]);
  useEffect(()=>{ try { localStorage.setItem('cn_auto_route', autoRoute ? '1' : '0'); } catch {} }, [autoRoute]);

  // Broadcast my live location to the group periodically (rate-limited)
  const prevPushLLRef = useRef<[number,number] | null>(null);
  const lastPushMsRef = useRef<number>(0);
  useEffect(()=>{
    if(!groupSession || !shareLocation) return;
    let timer:any; let kick:any;
    const push = async ()=>{
      try{
        const m = userMarkerRef.current?.getLngLat();
        if(!m) return;
        const now = Date.now();
        const ll: [number,number] = [m.lng, m.lat];
        const prev = prevPushLLRef.current;
        const moved = prev ? haversineMeters(prev, ll) : Infinity;
        const since = now - (lastPushMsRef.current || 0);
        // Only push if moved >12m or it's been >60s
        if (moved < 12 && since < 60000) return;
        const ref = doc(collection(db,'groupSessions'), groupSession.code);
        const updated: GroupMember[] = (groupSession.members||[]).map(mem=> mem.id===myId ? { ...mem, name: myName, location: ll } : mem);
        await updateDoc(ref, { members: updated, lastActiveAt: serverTimestamp() });
        prevPushLLRef.current = ll; lastPushMsRef.current = now;
      }catch{}
    };
    timer = setInterval(push, 10000);
    kick = setTimeout(push, 1200);
    return ()=>{ clearInterval(timer); clearTimeout(kick); };
  },[groupSession, myId, myName, shareLocation]);

  // Render group members on the map
  useEffect(()=>{
    if(!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const srcId = 'group-members';
    const labelId = 'group-members-labels';
    const feats = (groupSession?.members||[])
      .filter(m => Array.isArray(m.location) && m.location[0]!==0 && m.location[1]!==0)
      .map(m => ({ type:'Feature', geometry:{ type:'Point', coordinates:m.location }, properties:{ id:m.id, name:m.name||m.id } }));
    const fc:any = { type:'FeatureCollection', features: feats };
    try{
      if(!map.getSource(srcId)) map.addSource(srcId, { type:'geojson', data: fc } as any);
      else (map.getSource(srcId) as mapboxgl.GeoJSONSource).setData(fc);
      if(!map.getLayer(srcId)) map.addLayer({ id:srcId, type:'circle', source:srcId, paint:{ 'circle-radius':6, 'circle-color':'#10b981', 'circle-stroke-width':2, 'circle-stroke-color':'#ffffff' } });
      if(!map.getLayer(labelId)) map.addLayer({ id:labelId, type:'symbol', source:srcId, layout:{ 'text-field':['get','name'], 'text-size':11, 'text-offset':[0,1.2] }, paint:{ 'text-color':'#111827', 'text-halo-color':'#ffffff', 'text-halo-width':1 } });
    }catch{}
  },[groupSession, mapReady, styleVersion]);

  function copyGroupCode(){ if(!groupSession) return; try{ navigator.clipboard.writeText(groupSession.code); setSessionMsg('Code copied'); setTimeout(()=>setSessionMsg(''),1000);}catch{ setSessionMsg('Copy failed'); setTimeout(()=>setSessionMsg(''),1200);} }

  async function updateMyDisplayName(){
    try{
      if(!groupSession) { localStorage.setItem('cn_my_name', myName); return; }
      localStorage.setItem('cn_my_name', myName);
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
  const norm = (myName||'').trim().toLowerCase();
  if (!norm) { setSessionMsg('Enter a name'); setTimeout(()=>setSessionMsg(''),900); return; }
  const conflict = (groupSession.members||[]).some(m => m.id !== myId && (m.name||'').trim().toLowerCase() === norm);
  if (conflict) { setSessionMsg('Name already in use'); setTimeout(()=>setSessionMsg(''),1500); return; }
  const updated: GroupMember[] = (groupSession.members||[]).map(m=> m.id===myId ? { ...m, name: myName } : m);
      await updateDoc(ref, { members: updated });
      setSessionMsg('Name updated'); setTimeout(()=>setSessionMsg(''),900);
    }catch(e:any){ setSessionMsg(e?.message||'Update failed'); }
  }

  async function handleCreateSession(){
    try {
      setSessionBusy(true); setSessionMsg('');
      const code = (groupName.trim() ? groupName.trim() : Math.random().toString(36).substr(2,6)).toUpperCase().replace(/\s+/g,'-');
      const ref = doc(collection(db,'groupSessions'), code);
  const session: GroupSession = { code, name: groupName.trim()||undefined, members: [{ id: myId, name: myName, location: [0,0], route: [] }], targetPoiId: '', createdAt: serverTimestamp(), lastActiveAt: serverTimestamp(), tasks: [] };
  await setDoc(ref, session);
      setGroupSession(session);
      localStorage.setItem('cn_session_code', code);
      subscribeToSession(code);
    } catch(e:any){ setSessionMsg(e?.message||'Create failed'); } finally { setSessionBusy(false); }
  }
  async function handleJoinSession(codeArg?: string){
    try {
      const raw = (codeArg ?? joinCode).trim();
      if (!raw) return; setSessionBusy(true); setSessionMsg('');
  const code = raw.toUpperCase();
  if (groupSession?.code === code) { setSessionMsg('Already in this group'); setSessionBusy(false); return; }
      const ref = doc(collection(db,'groupSessions'), code);
      const snap = await getDoc(ref);
      let session: GroupSession;
      if (!snap.exists()) {
  session = { code, name: undefined, members: [{ id: myId, name: myName, location: [0,0], route: [] }], targetPoiId: '', createdAt: serverTimestamp(), lastActiveAt: serverTimestamp(), tasks: [] } as any;
        await setDoc(ref, session);
      } else {
        session = snap.data() as GroupSession;
        const already = session.members.find(m=>m.id===myId);
        if (!already) {
          const norm = (myName||'').trim().toLowerCase();
          const sameNameIdx = session.members.findIndex(m => (m.name||'').trim().toLowerCase() === norm);
          if (sameNameIdx >= 0) {
            const merged = session.members.slice();
            const prev = merged[sameNameIdx];
            merged[sameNameIdx] = { ...prev, id: myId, name: myName, location: prev.location||[0,0] as any };
            await updateDoc(ref, { members: merged }); session.members = merged;
          } else {
            const updated: GroupMember[] = [...session.members, { id: myId, name: myName, location: [0,0] as [number,number], route: [] }];
            await updateDoc(ref, { members: updated }); session.members = updated;
          }
        }
      }
      setGroupSession(session); localStorage.setItem('cn_session_code', code); subscribeToSession(code);
    } catch(e:any){ setSessionMsg(e?.message||'Join failed'); } finally { setSessionBusy(false); }
  }
  async function handleLeaveSession(){
    try {
      if (!groupSession) return; setSessionBusy(true); setSessionMsg('');
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
      const updated = groupSession.members.filter(m=>m.id!==myId); await updateDoc(ref, { members: updated });
    } catch(e:any){ setSessionMsg(e?.message||'Leave failed'); }
  finally { setGroupSession(null); unsubscribeFromSession(); localStorage.removeItem('cn_session_code'); setResumeCode(null); setSessionBusy(false); }
  }
  async function handleSetTarget(){
    try {
      if (!groupSession || !targetPoiId) return; setSessionBusy(true); setSessionMsg('');
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
  await updateDoc(ref, { targetPoiId, lastActiveAt: serverTimestamp() });
      const p = CAMPUS_POIS.find(pp=>pp.id===targetPoiId);
      if (p) {
        // Build a route locally for quick feedback
        let start: [number,number] | null = null;
        const m = userMarkerRef.current?.getLngLat(); if (m) start = [m.lng, m.lat];
        if (!start) start = schoolLL;
        routePreferSafe(start, p.coords as [number,number]);
      }
    } catch(e:any){ setSessionMsg(e?.message||'Update failed'); } finally { setSessionBusy(false); }
  }
  // auto-restore: offer resume instead of auto-joining (unless URL param provided)
  const [resumeCode, setResumeCode] = useState<string | null>(null);
  const autoJoinOnceRef = useRef(false);
  useEffect(()=>{
    if (autoJoinOnceRef.current) return;
    autoJoinOnceRef.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = (params.get('group') || '').trim();
      if (fromUrl) { handleJoinSession(fromUrl).catch(()=>{}); return; }
      const last = localStorage.getItem('cn_session_code');
      if (last) { setResumeCode(last); }
    } catch {
      const last = localStorage.getItem('cn_session_code');
      if (last) { setResumeCode(last); }
    }
  },[]);

  // --- Group preview helpers ---
  function openPreview(g: GroupSession){ setPreviewGroup(g); }
  function closePreview(){ setPreviewGroup(null); }
  function previewViewOnMap(){
    if (!previewGroup || !mapRef.current) return;
    const p = CAMPUS_POIS.find(pp=>pp.id===previewGroup.targetPoiId);
    if (!p) return;
    const map = mapRef.current;
  try { map.flyTo({ center: p.coords as any, zoom: 18 }); } catch {}
  showFocusMarker(p.coords as [number,number]);
    try { if (map.getLayer('poi-circles-selected')) { map.setFilter('poi-circles-selected', ['==','id', p.id]); } } catch {}
  }
  function previewFitBounds(){
    if (!previewGroup || !mapRef.current) return;
    const pts: [number,number][] = [];
    (previewGroup.members||[]).forEach(m=>{ if (Array.isArray(m.location) && m.location[0]!==0 && m.location[1]!==0) pts.push(m.location as [number,number]); });
    const t = CAMPUS_POIS.find(pp=>pp.id===(previewGroup.targetPoiId||'')); if (t) pts.push(t.coords as [number,number]);
    if (pts.length===0) return;
    const b = new mapboxgl.LngLatBounds(); pts.forEach(p=>b.extend(p as any));
    mapRef.current.fitBounds(b, { padding: 60, maxZoom: 18 });
  }

  function setToken() {
    const t = window.prompt('Paste Mapbox access token (pk...)', token || '');
    if (t != null) { try { localStorage.setItem('cn_mapbox_token', t.trim()); } catch {} window.location.reload(); }
  }

  // Browse/list groups (simple snapshot of all sessions)
  useEffect(()=>{
    const q = collection(db,'groupSessions');
    const unsub = onSnapshot(q as any, (snap:any)=>{
      const list: GroupSession[] = [];
      snap.forEach((d:any)=>list.push(d.data() as GroupSession));
      // Sort by member count desc
      list.sort((a,b)=>(b.members?.length||0)-(a.members?.length||0));
      setBrowseGroups(list);
    }, ()=>{});
    return ()=>{ try { unsub(); } catch {} };
  },[]);

  function flyToSchool(){ if (!mapRef.current) return; mapRef.current.flyTo({ center: schoolLL, zoom: 17 }); }
  function editSchool(){
    const s = window.prompt('Enter school coordinates as "lat,lng"', `${schoolLL[1].toFixed(6)},${schoolLL[0].toFixed(6)}`);
    if (!s) return;
    const parts = s.split(',').map(p=>p.trim());
    if (parts.length!==2) return alert('Please use the format: lat,lng');
    const lat = Number(parts[0]); const lng = Number(parts[1]);
    if (Number.isNaN(lat)||Number.isNaN(lng)) return alert('Invalid numbers');
    const ll: [number,number] = [lng, lat];
    setSchoolLL(ll);
    try { localStorage.setItem('school_ll', JSON.stringify(ll)); } catch {}
    flyToSchool();
  }

  // Campus prefs save/load
  useEffect(()=>{
    try {
      const sPoi = localStorage.getItem('cn_campus_poi'); if (sPoi) setPoiId(sPoi);
      const sFrom = localStorage.getItem('cn_nav_from'); if (sFrom) setNavFromId(sFrom);
      const sTo = localStorage.getItem('cn_nav_to'); if (sTo) setNavToId(sTo);
    } catch {}
  },[]);
  function saveCampusPrefs(){
    try {
      localStorage.setItem('cn_campus_poi', poiId||'');
      localStorage.setItem('cn_nav_from', navFromId||'');
      localStorage.setItem('cn_nav_to', navToId||'');
      setNote('Saved campus defaults'); setTimeout(()=>setNote(''), 900);
    } catch {}
  }

  // Show a focus/location icon marker at a specific coordinate
  function showFocusMarker(ll: [number,number]){
    if (!mapRef.current) return;
    const map = mapRef.current;
    try {
      if (!focusMarkerRef.current) {
        const el = document.createElement('div');
        el.style.position = 'relative';
        el.style.width = '22px'; el.style.height = '22px';
        el.style.borderRadius = '50%';
        el.style.background = '#ffffff';
        el.style.border = '3px solid #0ea5e9';
        el.style.boxShadow = '0 0 0 2px rgba(14,165,233,0.25)';
        const dot = document.createElement('div');
        dot.style.position = 'absolute'; dot.style.left = '50%'; dot.style.top = '50%'; dot.style.transform = 'translate(-50%,-50%)';
        dot.style.width = '6px'; dot.style.height = '6px'; dot.style.borderRadius = '50%'; dot.style.background = '#0ea5e9';
        el.appendChild(dot);
        focusMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map);
      } else {
        focusMarkerRef.current.setLngLat(ll);
      }
    } catch {}
  }

  function goToPoi(){
    try {
      if (!poiId) return;
      const p: CampusPOI | undefined = CAMPUS_POIS.find(pp => pp.id === poiId);
      if (!p || !mapRef.current) return;
      const map = mapRef.current;
  map.flyTo({ center: p.coords, zoom: 18 });
  showFocusMarker(p.coords as [number,number]);
      if (map.getLayer('poi-circles-selected')) {
        map.setFilter('poi-circles-selected', ['==','id', p.id]);
      }
    } catch (e) {
      console.warn('goToPoi failed', e);
    }
  }

  // --- Tasks ---
  async function handleAddTask(){
    try{
      if (!groupSession) return; const text = newTaskText.trim(); if (!text) return;
      // Firestore doesn't allow serverTimestamp() inside arrays; use client time here
      const task: GroupTask = { id: 't_'+Math.random().toString(36).slice(2,9), text, done: false, status: 'todo', by: myName||myId, ts: Date.now() } as any;
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
      const next = ([...(groupSession.tasks||[]), task]);
      await updateDoc(ref, { tasks: next, lastActiveAt: serverTimestamp() });
      setNewTaskText('');
    }catch(e:any){ setSessionMsg(e?.message||'Add task failed'); }
  }
  async function handleToggleTask(id: string){
    try{
      if (!groupSession) return;
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
      const next = (groupSession.tasks||[]).map(t => t.id===id ? { ...t, done: !t.done, status: (!t.done ? 'done' : (t.status||'todo')) } : t);
      await updateDoc(ref, { tasks: next, lastActiveAt: serverTimestamp() });
    }catch(e:any){ setSessionMsg(e?.message||'Update task failed'); }
  }

  async function handleMoveTask(id: string, to: 'todo'|'doing'|'done'){
    try{
      if (!groupSession) return;
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
      const next = (groupSession.tasks||[]).map(t => t.id===id ? { ...t, status: to, done: to==='done' } : t);
      await updateDoc(ref, { tasks: next, lastActiveAt: serverTimestamp() });
    }catch(e:any){ setSessionMsg(e?.message||'Move task failed'); }
  }

  async function handleDeleteTask(id: string){
    try{
      if (!groupSession) return;
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
      const next = (groupSession.tasks||[]).filter(t => t.id !== id);
      await updateDoc(ref, { tasks: next, lastActiveAt: serverTimestamp() });
      setSelectedTaskId(null);
    }catch(e:any){ setSessionMsg(e?.message||'Delete task failed'); }
  }

  async function handleRenameTask(id: string){
    try{
      if (!groupSession) return;
      const current = (groupSession.tasks||[]).find(t=>t.id===id);
      const nextText = window.prompt('Edit task', current?.text || '');
      if (nextText==null) return;
      const text = nextText.trim();
      if (!text) return;
      const ref = doc(collection(db,'groupSessions'), groupSession.code);
      const next = (groupSession.tasks||[]).map(t => t.id===id ? { ...t, text } : t);
      await updateDoc(ref, { tasks: next, lastActiveAt: serverTimestamp() });
    }catch(e:any){ setSessionMsg(e?.message||'Rename task failed'); }
  }

  function clearRoute(){
    if (!mapRef.current) return;
    try { if (mapRef.current.getLayer('route-line')) mapRef.current.removeLayer('route-line'); } catch {}
    try { if (mapRef.current.getSource('route-line')) (mapRef.current.getSource('route-line') as any).setData({ type:'FeatureCollection', features:[] }); } catch {}
    lastRouteGeoRef.current = null;
    setNote('');
  }

  function fitGroupBounds(){
    if (!mapRef.current) return;
    const pts: [number,number][] = [];
    (groupSession?.members||[]).forEach(m=>{
      if (Array.isArray(m.location) && m.location[0]!==0 && m.location[1]!==0) pts.push(m.location as [number,number]);
    });
    const t = CAMPUS_POIS.find(pp=>pp.id===(groupSession?.targetPoiId||''));
    if (t) pts.push(t.coords as [number,number]);
    if (pts.length===0) return;
    const b = new mapboxgl.LngLatBounds();
    pts.forEach(p=>b.extend(p as any));
    mapRef.current.fitBounds(b, { padding: 60, maxZoom: 18 });
  }

  async function drawRoute(from: [number,number], to: [number,number]){
    if (!mapRef.current) return;
    const map = mapRef.current;
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const json = await res.json();
      const route = json?.routes?.[0];
      const coords: [number,number][] = route?.geometry?.coordinates || [from, to];
      const dist = route?.distance || 0;
      const dur = route?.duration || 0;
      const data: GeoJSON.FeatureCollection = {
        type:'FeatureCollection',
        features:[{ type:'Feature', geometry:{ type:'LineString', coordinates: coords }, properties:{ distance:dist, duration:dur } } as any]
      } as any;
      lastRouteGeoRef.current = data;
      if (!map.getSource('route-line')) map.addSource('route-line', { type:'geojson', data } as any);
      else (map.getSource('route-line') as mapboxgl.GeoJSONSource).setData(data as any);
      if (!map.getLayer('route-line')) map.addLayer({ id:'route-line', type:'line', source:'route-line', paint:{ 'line-color':'#0077ff','line-width':5,'line-opacity':0.9 } });
  const b = new mapboxgl.LngLatBounds(); coords.forEach(c=>b.extend(c as any)); map.fitBounds(b, { padding: 60, maxZoom: 18 });
  const mins = dur>0 ? Math.round(dur/60) : Math.round((dist/1.4)/60);
  setNote(`Route: ${(dist/1000).toFixed(2)} km, ~${mins} min (walking)`);
    } catch (e) { console.warn('drawRoute failed', e); }
  }

  // Wrapper: prefer safer routing when user has enabled avoidHazards and hazards exist
  function routePreferSafe(from: [number,number], to: [number,number]){
    try{
      if (avoidHazards && hazards && hazards.length>0) {
        // prefer the safer route builder which will attempt alternatives and detours
        try { drawSafeRoute(from, to); return; } catch (e) { /* fallback */ }
      }
    } catch(e){}
    // fallback to plain route
    try { drawRoute(from, to); } catch(e){ console.warn('routePreferSafe fallback failed', e); }
  }

  // Auto-route to target when enabled
  useEffect(()=>{
    if (!autoRoute) return;
    const tid = (groupSession?.targetPoiId || targetPoiId);
    if (!tid) return;
    const target = CAMPUS_POIS.find(p=>p.id===tid);
    if (!target) return;
    const start = myLL || userMarkerRef.current?.getLngLat() && [userMarkerRef.current.getLngLat().lng, userMarkerRef.current.getLngLat().lat] as [number,number] || schoolLL;
  routePreferSafe(start, target.coords as [number,number]);
    // no cleanup needed
  },[autoRoute, groupSession?.targetPoiId, targetPoiId, myLL]);

  function buildRoute(){
    try {
      if (!navToId) return;
      const end = CAMPUS_POIS.find(p=>p.id===navToId);
      if (!end) return;
      let startLL: [number,number] | null = null;
      if (navFromId === 'CURRENT') {
        const m = userMarkerRef.current?.getLngLat();
        if (m) startLL = [m.lng, m.lat];
        if (!m) setNote('Turn on My Location to route from your position. Using school center.');
      } else if (navFromId === 'SCHOOL') {
        startLL = schoolLL;
      } else {
        const s = CAMPUS_POIS.find(p=>p.id===navFromId); if (s) startLL = s.coords as [number,number];
      }
      if (!startLL) startLL = schoolLL;
  routePreferSafe(startLL, end.coords as [number,number]);
    } catch (e) { console.warn('buildRoute failed', e); }
  }

  // Focus marker clear
  function clearFocusMarker(){ try { focusMarkerRef.current?.remove(); focusMarkerRef.current = null; } catch {} }

  // Auto-save preferences across tabs
  function autoSavePreferences(){
    try {
      // Map style
      localStorage.setItem('cn_style_key', styleKey);
      // Campus prefs
      localStorage.setItem('cn_campus_poi', poiId||'');
      localStorage.setItem('cn_nav_from', navFromId||'');
      localStorage.setItem('cn_nav_to', navToId||'');
      // Location prefs
      localStorage.setItem('cn_gps_autostart', gpsAutoStart ? '1' : '0');
      setNote('Saved'); setTimeout(()=>setNote(''), 900);
    } catch {}
  }
  function handleBack(){ autoSavePreferences(); setActiveTab('Groups'); }
  function handleExit(){ autoSavePreferences(); setShowLF(false); clearFocusMarker(); setActiveTab('Groups'); }

  // Simple user location (blue dot) with GPS toggle
  function toggleGPS(){
    if (!navigator.geolocation) { setNote('Geolocation not supported.'); return; }
    if (gpsActive) {
      if (watchIdRef.current!=null) { try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {} watchIdRef.current = null; }
      setGpsActive(false);
      return;
    }
    // Avoid duplicate watchers
    if (watchIdRef.current!=null) { try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {} watchIdRef.current = null; }
    setGpsActive(true);
    let first = true;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const ll: [number,number] = [longitude, latitude];
        const map = mapRef.current; if (!map) return;
        try {
          if (!userMarkerRef.current) {
            const el = document.createElement('div');
            el.style.width = '20px'; el.style.height = '20px'; el.style.borderRadius = '50%';
            el.style.background = '#4285F4'; el.style.border = '2px solid white';
            el.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.9), 0 0 10px 2px rgba(66,133,244,0.6)';
            userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(ll).addTo(map);
          } else {
            userMarkerRef.current.setLngLat(ll);
          }
          setMyLL(ll);
          if (first) { first = false; try { map.flyTo({ center: ll, zoom: 17 }); } catch {} }
          setNote('');
        } catch {}
      },
      (err) => { setNote('GPS unavailable: ' + (err?.message || 'timeout')); /* keep watching; user can stop */ },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 60000 }
    );
  }

  // Clear GPS watcher on unmount just in case
  useEffect(()=>{ return ()=>{ try { if (watchIdRef.current!=null) navigator.geolocation.clearWatch(watchIdRef.current); } catch {} }; },[]);

  function haversineMeters(a: [number,number], b: [number,number]){
    const toRad = (x:number)=>x*Math.PI/180;
    const R = 6371000;
    const dLat = toRad(b[1]-a[1]);
    const dLon = toRad(b[0]-a[0]);
    const lat1 = toRad(a[1]); const lat2 = toRad(b[1]);
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }

  function etaMinutes(from: [number,number], to: [number,number]){
    const dist = haversineMeters(from, to);
    const secs = dist / 1.4; // ~1.4 m/s walking
    return Math.round(secs/60);
  }

  return (
    <div style={{ width: '100%', height: '100vh', display:'flex', fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif' }}>
      {/* Left: Map area */}
      <div style={{ flex:1, position:'relative', minWidth:0 }}>
        <div ref={ref} id="campus-map" tabIndex={-1} aria-label="Campus map" style={{ position: 'absolute', inset: 0, outline:'1px solid #d1d5db', background:'#e8f0fe' }} />
        {/* Map overlays */}
        {status !== 'ready' && (<div style={banner}>{status === 'loading' ? 'Loading map…' : `Map error: ${err}`}</div>)}
        {note && (<div style={{...banner, top: 44, background:'#0b3d20'}}>ℹ️ {note}</div>)}
      </div>

    {/* Right: Activities sidebar (responsive so tabs are never clipped) */}
  <div style={{ width: 'clamp(300px, 34vw, 420px)', maxWidth:'100%', padding:12, display:'flex', flexDirection:'column', gap:12, background:'#f9fafb', borderLeft:'1px solid #e5e7eb', height:'100%', overflowX:'hidden', boxSizing:'border-box', minWidth:0 }}>
        {/* Tabs */}
  <div style={{display:'flex', gap:6, background:'#eef2ff', padding:6, borderRadius:10, border:'1px solid #e5e7eb', flexWrap:'wrap', position:'sticky', top:0, zIndex:1, minWidth:0, maxWidth:'100%', boxSizing:'border-box'}}>
          {tabs.map(t => (
            <button key={t} onClick={()=>openTab(t)}
              style={{
                ...btn,
                padding:'6px 10px',
                fontSize:12,
                borderRadius:8,
                maxWidth:'100%',
                minWidth:0,
                whiteSpace:'normal',
                wordBreak:'break-word',
                overflowWrap:'anywhere',
                textAlign:'center',
                lineHeight:1.2,
                flex:'0 1 auto',
                background: activeTab===t ? '#ffffff' : 'transparent',
                borderColor: activeTab===t ? '#cbd5e1' : 'transparent',
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Back/Exit controls (Skip to Map removed) */}
        <div style={{display:'flex', justifyContent:'flex-end', alignItems:'center', gap:6}}>
          <button onClick={goBack} style={{...btn, opacity: tabHistory.length?1:.6, cursor: tabHistory.length? 'pointer':'not-allowed'}} disabled={!tabHistory.length}>Back</button>
          <button onClick={()=>{ setTabHistory([]); setShowLF(false); clearFocusMarker(); setActiveTab('Home'); }} style={btn}>Exit</button>
        </div>

  {/* Tab content: allow vertical scroll only; prevent horizontal overflow */}
  <div style={{display:'flex', flexDirection:'column', gap:12, flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', maxWidth:'100%', minWidth:0, paddingBottom:4}}>
  {activeTab==='Home' && (
          <div style={card}>
            <div style={cardTitle}>Home</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              {(['Groups','Campus','Map','Location','Lost+Found','Emergency'] as const).map(t => (
                <button key={'home_'+t} onClick={()=>openTab(t)} style={{...btn, padding:'14px 12px'}}>{t}</button>
              ))}
            </div>
          </div>
        )}

  {activeTab==='Map' && (
          <div style={card}>
            <div style={cardTitle}>Map style (Mapbox)</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button onClick={() => setStyleKey(k => (k === 'streets' ? 'sat' : 'streets'))} style={{ ...btn, flex:1 }} disabled={!token}>{styleKey === 'streets' ? 'Satellite' : 'Streets'}</button>
              <button onClick={saveStyleAsDefault} style={{...btn}}>Save</button>
            </div>
            <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
              <button onClick={setToken} style={{...btn}}>Set Token</button>
              {!token && <div style={{flex:1, background:'#fee2e2', border:'1px solid #ef4444', padding:8, borderRadius:8, fontSize:12}}>No Mapbox token configured. Set REACT_APP_MAPBOX_TOKEN or cn_mapbox_token in localStorage.</div>}
            </div>
          </div>
        )}

        {activeTab==='Groups' && (
          <div style={{...card, display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
            <div style={cardTitle}>Groups</div>
            {!groupSession && (<div style={{fontSize:12, color:'#6b7280', marginTop:-4}}>Create or join a group, set a target, and find members on the map.</div>)}
            {!groupSession ? (
              <div style={{display:'flex', flexDirection:'column', gap:8, flex:1, minHeight:0}}>
                {resumeCode && (
                  <div style={{border:'1px dashed #cbd5e1', background:'#f8fafc', borderRadius:8, padding:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{fontSize:12, color:'#374151'}}>Resume last group: <span style={{fontFamily:'monospace'}}>{resumeCode}</span></div>
                    <div style={{display:'flex', gap:6}}>
                      <button style={btn} onClick={()=>handleJoinSession(resumeCode)}>Open</button>
                      <button style={btn} onClick={()=>setResumeCode(null)}>Dismiss</button>
                    </div>
                  </div>
                )}
                <div style={{display:'grid', gap:8}}>
                  <input placeholder="Group name (e.g., CSC101) — optional" value={groupName} onChange={e=>setGroupName(e.target.value)} style={{...input, width:'100%'}} />
                  <div style={{display:'flex', gap:8}}>
                    <button onClick={handleCreateSession} disabled={sessionBusy} style={{...btn, flex:1}}>Create Group</button>
                    <input placeholder="Enter code/name" value={joinCode} onChange={e=>setJoinCode(e.target.value)} style={{...input, flex:1}} />
                    <button onClick={()=>handleJoinSession()} disabled={!joinCode||sessionBusy} style={{...btn}}>Join</button>
                  </div>
                </div>
                <div style={{marginTop:6, fontSize:12, color:'#6b7280'}}>Nearby/active groups</div>
                {previewGroup && (
                  <div style={{border:'1px solid #d1d5db', borderRadius:8, padding:8, background:'#fafafa', display:'grid', gap:6}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div style={{fontSize:13, fontWeight:700}}>{previewGroup.name || previewGroup.code}</div>
                      <button style={{...btn, padding:'4px 8px'}} onClick={closePreview}>Close</button>
                    </div>
                    <div style={{fontSize:12, color:'#374151'}}>
                      Code: <span style={{fontFamily:'monospace'}}>{previewGroup.code}</span> • Members: {previewGroup.members?.length||0}
                      {previewGroup.targetPoiId ? ` • Target: ${CAMPUS_POIS.find(p=>p.id===previewGroup.targetPoiId)?.name||previewGroup.targetPoiId}` : ''}
                    </div>
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      <button style={btn} onClick={previewViewOnMap} disabled={!previewGroup.targetPoiId} title="View target on map" aria-label="View target on map">View on Map</button>
                      <button style={btn} onClick={previewFitBounds} title="Fit map to members and target" aria-label="Fit map to members and target">Fit to Group</button>
                      <button style={btn} onClick={()=>{ setJoinCode(previewGroup.code); handleJoinSession(previewGroup.code); }} title="Join this group" aria-label="Join this group">Join</button>
                    </div>
                  </div>
                )}
                <div style={{display:'grid', gap:6}}>
                  {browseGroups.length===0 && <div style={{fontSize:12, color:'#9ca3af'}}>No groups yet.</div>}
                  {browseGroups.map(g=> (
                    <div key={g.code} style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px'}}>
                      <div style={{display:'grid'}}>
                        <div style={{fontSize:13, fontWeight:600}}>{g.name || g.code}</div>
                        <div style={{fontSize:11, color:'#6b7280'}}>{g.members?.length||0} member(s){g.targetPoiId?` • Target: ${CAMPUS_POIS.find(p=>p.id===g.targetPoiId)?.name||g.targetPoiId}`:''}</div>
                      </div>
                      <div style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end'}}>
                        <button onClick={()=>openPreview(g)} style={btn} title="Preview details" aria-label="Preview details">Preview</button>
                        <button onClick={()=>{ setJoinCode(g.code); handleJoinSession(g.code); }} style={btn}>{(g.members||[]).some(m=>m.id===myId)?'Open':'Join'}</button>
                      </div>
                    </div>
                  ))}
                </div>
                {sessionMsg && <div style={{background:'#fff7ed', border:'1px solid #fdba74', padding:6, borderRadius:8, fontSize:12}}>{sessionMsg}</div>}
              </div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:8, flex:1, minHeight:0}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div style={{fontSize:12, color:'#374151'}}>Code</div>
                    <div style={{fontFamily:'monospace', fontSize:14}}>{groupSession.code}</div>
                  </div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                    <button onClick={copyGroupCode} style={btn} title="Copy group code" aria-label="Copy group code">Copy Code</button>
                    {typeof navigator !== 'undefined' && (navigator as any).share && (
                      <button style={btn} title="Share invite" aria-label="Share invite" onClick={()=> (navigator as any).share({ title:'Join my group', text:`Join group ${groupSession?.code}`, url: window.location.href }).catch(()=>{})}>Share Invite</button>
                    )}
                    <button style={btn} onClick={fitGroupBounds} title="Fit map to members and target" aria-label="Fit map to members and target">Fit to Group</button>
                  </div>
                </div>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <label style={{display:'flex', gap:6, alignItems:'center', fontSize:12, color:'#374151'}}>
                    <input type="checkbox" checked={shareLocation} onChange={e=>setShareLocation(e.target.checked)} /> Share my location
                  </label>
                  <label style={{display:'flex', gap:6, alignItems:'center', fontSize:12, color:'#374151'}}>
                    <input type="checkbox" checked={autoRoute} onChange={e=>setAutoRoute(e.target.checked)} /> Auto-route to target
                  </label>
                </div>
                <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                  <div style={{fontSize:12, color:'#374151'}}>Target</div>
                  <select value={targetPoiId} onChange={e=>setTargetPoiId(e.target.value)} style={{...input, flex:1}}>
                    <option value="">Target POI…</option>
                    {CAMPUS_POIS.map(p=>(<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                  <button onClick={handleSetTarget} disabled={!targetPoiId||sessionBusy} style={btn} title="Set group target" aria-label="Set group target">Set Target</button>
                  <button onClick={()=>{ const p=CAMPUS_POIS.find(pp=>pp.id===targetPoiId); if(!p) return; let start:[number,number]|null=null; const m=userMarkerRef.current?.getLngLat(); if(m) start=[m.lng,m.lat]; if(!start) start=schoolLL; routePreferSafe(start, p.coords as [number,number]); }} disabled={!targetPoiId} style={btn} title="Route to target" aria-label="Route to target">Route to Target</button>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  <div style={{fontSize:12, color:'#6b7280'}}>Members</div>
                  <div style={{display:'grid', gap:6}}>
                    {(groupSession.members||[]).map(m=>{
                      const isMe = m.id===myId; const locOk = Array.isArray(m.location) && m.location[0]!==0 && m.location[1]!==0;
                      const target = groupSession.targetPoiId ? CAMPUS_POIS.find(p=>p.id===groupSession.targetPoiId) : null;
                      const eta = (locOk && target) ? etaMinutes(m.location as [number,number], target.coords as [number,number]) : null;
                      return (
                        <div key={m.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px'}}>
                          <div style={{display:'grid'}}>
                            <div style={{fontSize:13, fontWeight:600}}>{m.name || m.id}{isMe?' (you)':''}</div>
                            <div style={{fontSize:11, color:'#6b7280'}}>
                              {locOk? 'Live' : 'No location'}
                              {eta!=null ? ` • ETA to target ~${eta} min` : ''}
                            </div>
                          </div>
                          {locOk && (
                            <div style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end'}}>
                              <button style={btn} title="Show on map" aria-label="Show on map" onClick={()=>{ if(!mapRef.current) return; mapRef.current.flyTo({ center: m.location as any, zoom: 17 }); showFocusMarker(m.location as [number,number]); }}>Show on Map</button>
                              <button style={btn} title="Route to member" aria-label="Route to member" onClick={()=>{ let start:[number,number]|null=null; const mm=userMarkerRef.current?.getLngLat(); if(mm) start=[mm.lng,mm.lat]; if(!start) start=schoolLL; routePreferSafe(start, m.location as [number,number]); }}>Route to Member</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{display:'grid', gap:6}}>
                  <div style={{fontSize:12, color:'#6b7280'}}>Tasks</div>
                  <div style={{display:'grid', gap:8}}>
                    {/* Kanban columns */}
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:8}}>
                      {(['todo','doing','done'] as const).map(col => {
            const items = (groupSession.tasks||[]).filter(t => (t.status || (t.done ? 'done' : 'todo')) === col);
            const title = col==='todo'?'To Do': col==='doing'?'In Progress':'Done';
                        return (
                          <div key={col} style={{border:'1px solid #e5e7eb', borderRadius:8, padding:8, display:'flex', flexDirection:'column', gap:6, minHeight:80}}>
              <div style={{fontSize:12, fontWeight:600}}>{title} <span style={{color:'#6b7280'}}>({items.length||0} item{items.length===1?'':'s'})</span></div>
                            {col==='todo' && (
                              <div style={{display:'flex', gap:6}}>
                                <input value={newTaskText} onChange={e=>setNewTaskText(e.target.value)} placeholder="New task…" style={{...input, flex:1}} />
                                <button style={btn} onClick={handleAddTask} disabled={!newTaskText.trim()}>Add</button>
                              </div>
                            )}
                            <div style={{display:'grid', gap:6}}>
                              {items.length===0 && <div style={{fontSize:11, color:'#9ca3af'}}>No items</div>}
                              {items.map(t => (
                                <div
                                  key={t.id}
                                  style={{border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px', display:'grid', gap:6, cursor:'pointer'}}
                                  onClick={()=>setSelectedTaskId(t.id)}
                                  role="button" tabIndex={0}
                                  onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setSelectedTaskId(t.id); } }}
                                >
                                  <div style={{fontSize:13}}>{t.text}</div>
                                  <div style={{display:'flex', gap:6, flexWrap:'wrap'}} onClick={(e)=>e.stopPropagation()}>
                                    <button style={{...btn, whiteSpace:'nowrap'}} onClick={()=>setSelectedTaskId(t.id)}>Details</button>
                  <button style={{...btn, whiteSpace:'nowrap'}} onClick={()=>handleRenameTask(t.id)}>Edit</button>
                  <button style={{...btn, whiteSpace:'nowrap', background:'#fee2e2', borderColor:'#fca5a5'}} onClick={()=>handleDeleteTask(t.id)}>Delete</button>
                                    {/* Move between To Do and In Progress */}
                                    {col!=='done' && (
                                      <button
                                        style={{...btn, whiteSpace:'nowrap'}}
                                        onClick={()=>handleMoveTask(t.id, col==='todo' ? 'doing' : 'todo')}
                                      >
                                        {col==='todo' ? 'Start' : 'Back'}
                                      </button>
                                    )}
                                    {/* Mark Done / Reopen */}
                                    {col!=='done' && <button style={{...btn, whiteSpace:'nowrap'}} onClick={()=>handleMoveTask(t.id, 'done')}>Done</button>}
                                    {col==='done' && <button style={{...btn, whiteSpace:'nowrap'}} onClick={()=>handleMoveTask(t.id, 'todo')}>Reopen</button>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* Task details modal */}
                {selectedTaskId && (()=>{
                  const t = (groupSession?.tasks||[]).find(x=>x.id===selectedTaskId);
                  if(!t) return null;
                  const status = (t.status || (t.done?'done':'todo')) as 'todo'|'doing'|'done';
                  const created = t.ts ? new Date(t.ts) : null;
                  return (
                    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'grid', placeItems:'center', zIndex:100}} role="dialog" aria-modal="true" aria-labelledby="task-title">
                      <div style={{width:480, maxWidth:'95vw', background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12, boxShadow:'0 16px 40px rgba(0,0,0,.35)'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <div id="task-title" style={{fontWeight:700}}>{t.text}</div>
                          <button style={btn} onClick={()=>setSelectedTaskId(null)} aria-label="Close">Close</button>
                        </div>
                        <div style={{marginTop:8, fontSize:12, color:'#374151'}}>
                          <div><strong>Status:</strong> {status==='todo'?'To Do': status==='doing'?'In Progress':'Done'}</div>
                          {t.by && <div><strong>By:</strong> {t.by}</div>}
                          {created && <div><strong>Created:</strong> {created.toLocaleString()}</div>}
                        </div>
                        <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:12}}>
                          {status==='todo' && <button style={btn} onClick={()=>handleMoveTask(t.id, 'doing')}>Start Progress</button>}
                          {status==='doing' && <button style={btn} onClick={()=>handleMoveTask(t.id, 'todo')}>Back to To Do</button>}
                          {status!=='done' && <button style={btn} onClick={()=>handleMoveTask(t.id, 'done')}>Mark Done</button>}
                          {status==='done' && <button style={btn} onClick={()=>handleMoveTask(t.id, 'todo')}>Reopen</button>}
                          <button style={btn} onClick={()=>handleRenameTask(t.id)}>Rename</button>
                          <button style={{...btn, background:'#fee2e2', borderColor:'#fca5a5'}} onClick={()=>handleDeleteTask(t.id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <input value={myName} onChange={e=>setMyName(e.target.value)} placeholder="Your display name" style={{...input, flex:1}} />
                  <button style={btn} onClick={updateMyDisplayName}>Update</button>
                </div>
                <button onClick={handleLeaveSession} disabled={sessionBusy} style={{...btn, background:'#fee2e2', borderColor:'#fca5a5'}}>Leave Group</button>
                {sessionMsg && <div style={{background:'#fff7ed', border:'1px solid #fdba74', padding:6, borderRadius:8, fontSize:12}}>{sessionMsg}</div>}
              </div>
            )}
          </div>
  )}

  {activeTab==='Campus' && (
          <div style={card}>
            <div style={cardTitle}>Campus</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button onClick={flyToSchool} style={{...btn, flex:1}}>Center on USIU</button>
            </div>
            <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
              <select value={poiId} onChange={e=>setPoiId(e.target.value)} style={{...input, flex:1}}>
                <option value="">Select POI…</option>
                {CAMPUS_POIS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={goToPoi} style={{...btn, flex:1}} disabled={!poiId}>Go</button>
              <button onClick={saveCampusPrefs} style={btn}>Save</button>
            </div>
            <div style={{display:'grid', gap:8, marginTop:8}}>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <select value={navFromId} onChange={e=>setNavFromId(e.target.value)} style={{...input, flex:1}}>
                  <option value="CURRENT">From: My Location</option>
                  <option value="SCHOOL">From: School Center</option>
                  {CAMPUS_POIS.map(p => <option key={'from_'+p.id} value={p.id}>From: {p.name}</option>)}
                </select>
                <select value={navToId} onChange={e=>setNavToId(e.target.value)} style={{...input, flex:1}}>
                  <option value="">To: Select POI</option>
                  {CAMPUS_POIS.map(p => <option key={'to_'+p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <button onClick={buildRoute} style={{...btn, flex:1}} disabled={!navToId}>Build Route</button>
                <button onClick={clearRoute} style={{...btn, flex:1}}>Clear Route</button>
                <button onClick={saveCampusPrefs} style={btn}>Save</button>
              </div>
            </div>
          </div>
        )}

  {activeTab==='Location' && (
          <div style={card}>
            <div style={cardTitle}>Location</div>
            <button onClick={toggleGPS} style={{...btn, width:'100%', ...(gpsActive?active:{})}}>{gpsActive? 'Stop GPS' : 'My Location'}</button>
            <div style={{display:'flex', gap:8, alignItems:'center', marginTop:8, flexWrap:'wrap'}}>
              <label style={{display:'flex', gap:8, alignItems:'center', fontSize:12, color:'#374151'}}>
                <input type='checkbox' checked={gpsAutoStart} onChange={e=>setGpsAutoStart(e.target.checked)} /> Start GPS on launch
              </label>
              <button style={btn} onClick={()=>{ try { localStorage.setItem('cn_gps_autostart', gpsAutoStart?'1':'0'); setNote('Saved'); setTimeout(()=>setNote(''), 900); } catch {} }}>Save</button>
            </div>
          </div>
        )}

        {activeTab==='Lost+Found' && (
          <div style={{...card, display:'flex', flexDirection:'column', minHeight:0, height:'100%'}}>
            <div style={{...cardTitle, position:'sticky', top:0, background:'#fff', zIndex:1}}>Lost & Found</div>
            <div style={{flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden'}}>
              <LostFoundPanel inline onClose={()=>setShowLF(false)} onLocate={(pid)=>{
              const p = CAMPUS_POIS.find(pp=>pp.id===pid); if (!p || !mapRef.current) return;
              mapRef.current.flyTo({ center: p.coords, zoom: 18 }); showFocusMarker(p.coords as [number,number]);
              let start: [number,number] | null = null; const m = userMarkerRef.current?.getLngLat(); if (m) start = [m.lng, m.lat]; if (!start) start = schoolLL; routePreferSafe(start, p.coords as [number,number]);
            }} />
            </div>
          </div>
        )}

        {activeTab==='Emergency' && (
          <div style={card}>
            <div style={cardTitle}>Emergency</div>
            <div style={{fontSize:12, color:'#6b7280', marginTop:-4}}>Mark temporary hazards and build a safer route.</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:8}}>
              <button style={btn} onClick={()=>{ const next=!hazardAdd; setHazardAdd(next); setNote(next? 'Click the map to add hazard points' : ''); }}>
                {hazardAdd? 'Finish Adding' : 'Add Hazard'}
              </button>
              <button style={btn} onClick={()=>setHazards([])} disabled={!hazards.length}>Clear Hazards</button>
              <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#374151'}}>
                <input type="checkbox" checked={avoidHazards} onChange={e=>setAvoidHazards(e.target.checked)} /> Prefer safer route
              </label>
              <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#374151'}}>
                Default radius (m)
                <input style={{...input, width:90}} type="number" min={5} max={200} step={5} value={hazardRadiusM}
                  onChange={e=>{ const v = Math.max(5, Math.min(200, parseInt(e.target.value||'0',10))); setHazardRadiusM(v); }} />
              </label>
            </div>
            <div style={{marginTop:10}}>
              <div style={{fontSize:12, color:'#6b7280'}}>Destination</div>
              <select value={emergencyTargetId} onChange={e=>setEmergencyTargetId(e.target.value)} style={{...input, width:'100%'}}>
                <option value="">Select destination…</option>
                {CAMPUS_POIS.map(p=> <option key={'e_'+p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div style={{display:'flex', gap:8, marginTop:8}}>
                <button style={{...btn, flex:1}} disabled={!emergencyTargetId} onClick={()=>{
                  const p=CAMPUS_POIS.find(pp=>pp.id===emergencyTargetId); if(!p) return;
                  let start:[number,number]|null=null; const m=userMarkerRef.current?.getLngLat(); if(m) start=[m.lng,m.lat]; if(!start) start=schoolLL;
                  drawSafeRoute(start, p.coords as [number,number]);
                }}>Build Safer Route</button>
                <button style={{...btn, flex:1}} onClick={clearRoute}>Clear Route</button>
              </div>
            </div>
            <div style={{marginTop:8, fontSize:12, color:'#6b7280'}}>
              {hazards.length} hazard{hazards.length===1?'':'s'} on map · Tip: click a red dot to delete
            </div>
          </div>
        )}
  </div>
      </div>

    </div>
  );
}

const btn: React.CSSProperties = { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, boxShadow: '0 1px 2px rgba(0,0,0,.1)', whiteSpace:'normal', wordBreak:'break-word' };
const active: React.CSSProperties = { background: '#2d7ef7', color: '#fff', borderColor: '#2d7ef7' };
const banner: React.CSSProperties = { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: '#14233b', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 14px -4px rgba(0,0,0,.35)' };
const card: React.CSSProperties = { background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:12, padding:12, boxShadow:'0 2px 8px rgba(0,0,0,.06)' };
const cardTitle: React.CSSProperties = { fontWeight:600, fontSize:13, color:'#111827', marginBottom:8 };
const input: React.CSSProperties = { padding:'6px 8px', border:'1px solid #cbd5e1', borderRadius: 8, fontSize: 13, minWidth:0 };
