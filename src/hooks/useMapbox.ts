import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { CAMPUS_POIS, CampusPOI, CATEGORY_COLORS } from '../data/campusPOIs';

export interface UseMapboxResult {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  isReady: boolean;
  error: string | null;
  setStyle: (s: 'streets' | 'sat') => void;
  style: 'streets' | 'sat';
  markersRef: React.MutableRefObject<Record<string, mapboxgl.Marker>>;
  addPoiMarkers: (onClick: (p: CampusPOI)=>void) => void;
  ensurePoiLayer: (onClick: (p: CampusPOI)=>void) => void;
  setPoiCategoryFilter: (cat: string | null) => void;
  clearDomMarkers: () => void;
}

export function useMapbox(containerRef: React.RefObject<HTMLDivElement>, token: string): UseMapboxResult {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<'streets' | 'sat'>('streets');
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const disableMapboxRef = useRef(false);
  const prevStyleRef = useRef<'streets'|'sat'|null>(null);
  // Inline OSM raster style to avoid relying on external style.json
  const OSM_RASTER_STYLE: any = {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [
      { id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }
    ]
  };
  const BACKGROUND_STYLE: any = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8f0fe' } }] };

  // If token changes (e.g., user updated .env or localStorage), re-enable Mapbox attempts
  useEffect(() => {
    disableMapboxRef.current = false;
  }, [token]);

  // If a new non-empty token arrives, re-allow Mapbox switching
  useEffect(() => {
    if (token && token.length > 10) {
      disableMapboxRef.current = false;
    }
  }, [token]);

  // Init
  useEffect(() => {
  // Clear orphaned instance (StrictMode)
    if (mapRef.current) {
      const containerEl = (mapRef.current as any).getContainer?.();
      if (!containerEl || !containerEl.isConnected) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
    }
  if (mapRef.current || !containerRef.current) return;
    // Ensure token is applied here as well (defensive)
    (mapboxgl as any).accessToken = token;
    // WebGL support check
    if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
      setError('Map rendering not supported in this browser (WebGL unavailable).');
      return;
    }
    // Start with a solid background to avoid any white screen; then add OSM tiles into the same style
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: BACKGROUND_STYLE as any,
      center: [36.8789, -1.2165],
      zoom: 15
    });
    mapRef.current = map;
    const onLoad = () => { setIsReady(true); setError(null); };
    map.on('load', onLoad);
    map.on('error', (e: any) => {
      const msg = e?.error?.message || e?.message || String(e);
      setError(msg);
      // If Mapbox auth errors appear later, permanently disable Mapbox switching
      if (/access token|unauthorized|forbidden|401|403/i.test(msg)) disableMapboxRef.current = true;
      // stay on background; we no longer swap styles automatically
    });
    // After the first frame, add OSM raster source/layer directly (no style swap)
    const addOSM = () => {
      try {
        if (!map.getSource('osm')) {
          map.addSource('osm', { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } as any);
        }
        if (!map.getLayer('osm-tiles')) {
          map.addLayer({ id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 });
        }
        setError(null);
      } catch (e:any) {
        setError('OSM tiles failed to init; staying on background.');
      }
    };
    // If style is already loaded, add immediately; else add on next tick
    if (map.isStyleLoaded()) addOSM(); else setTimeout(addOSM, 50);

  // WebGL context loss safety
    const canvas = map.getCanvas();
  const onLost = (ev: any) => { ev?.preventDefault?.(); setError('Graphics reset; recovering…'); /* background stays */ };
  const onRestored = () => { setError(null); try { addOSM(); } catch {} };
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      try { map.remove(); } finally { if (mapRef.current === map) mapRef.current = null; }
    };
  }, [token]);

  // Style swap (only when user changes style)
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!mapRef.current) return;
    // Skip auto-run on initial mount to avoid switching away from OSM fallback
    if (!didMountRef.current) { didMountRef.current = true; prevStyleRef.current = style; return; }
    // Only react when the style value actually changes (user intent)
    if (prevStyleRef.current === style) return;
    prevStyleRef.current = style;
    // If Mapbox is disabled or no token, remain on OSM fallback
    if (disableMapboxRef.current || !token) return;

    setIsReady(false);
    let timeout: any;
    const onLoad = () => {
      clearTimeout(timeout);
      setIsReady(true);
      // Reattach markers if needed
      Object.values(markersRef.current).forEach(marker => {
        const el = marker.getElement();
        if (!el.isConnected && mapRef.current) {
          try { marker.addTo(mapRef.current); } catch {}
        }
        try { const ll = (marker as any)._lngLat; if (ll) marker.setLngLat(ll); } catch {}
      });
    };
    mapRef.current.on('style.load', onLoad);

    const next = style === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/satellite-streets-v12';
    try { mapRef.current.setStyle(next); } catch {}

    // Guard: if Mapbox style doesn't load in time, revert to OSM and disable further attempts
    timeout = setTimeout(() => {
      if (!mapRef.current) return;
      try { mapRef.current.setStyle(OSM_RASTER_STYLE as any); } catch {}
      disableMapboxRef.current = true;
      setError('Map style load timeout. Staying on offline basemap.');
      setIsReady(true);
  }, 1500);

    return () => {
      clearTimeout(timeout);
      mapRef.current && mapRef.current.off('style.load', onLoad);
    };
  }, [style]);

  function addPoiMarkers(onClick: (p: CampusPOI)=>void) {
    if (!mapRef.current) return;
  // Guard removed map
    const anyMap = mapRef.current as any;
    if (!anyMap._container || anyMap._removed) return;
    CAMPUS_POIS.forEach(p => {
  if (markersRef.current[p.id]) return;
      const el = document.createElement('div');
      el.className = 'poi-marker';
      el.title = p.name;
      el.addEventListener('click', () => onClick(p));
      try {
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(p.coords).addTo(mapRef.current!);
        markersRef.current[p.id] = marker;
      } catch (e) {
        console.warn('[addPoiMarkers] failed for', p.id, e);
      }
    });
  }

  function clearDomMarkers(){
    Object.values(markersRef.current).forEach(m=>{ try { m.remove(); } catch {} });
  markersRef.current = { } as any;
  }

  // GeoJSON POIs
  function ensurePoiLayer(onClick: (p: CampusPOI)=>void) {
    if(!mapRef.current) return;
    const map = mapRef.current;
    const srcId = 'pois';
    if(!map.getSource(srcId)){
      const fc: GeoJSON.FeatureCollection<GeoJSON.Point, any> = {
        type:'FeatureCollection',
        features: CAMPUS_POIS.map(p=>({
          type:'Feature',
            geometry:{ type:'Point', coordinates: p.coords },
            properties:{ id:p.id, name:p.name, category:p.category }
        }))
      };
      map.addSource(srcId,{ type:'geojson', data: fc });
      // Category colors (built from shared map)
      const colorExpr: any = (() => {
        const parts: any[] = ['match', ['get', 'category']];
        (Object.keys(CATEGORY_COLORS) as Array<keyof typeof CATEGORY_COLORS>).forEach(k => {
          parts.push(k, CATEGORY_COLORS[k]);
        });
        parts.push('#2d7ef7'); // default
        return parts;
      })();

      map.addLayer({
        id:'poi-circles',
        type:'circle',
        source:srcId,
        paint:{
          'circle-radius': 5,
          'circle-color': colorExpr,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
  // Highlight layer
      map.addLayer({
        id:'poi-circles-selected',
        type:'circle',
        source:srcId,
        paint:{
          'circle-radius': 7,
          'circle-color': '#ff8800',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        },
        filter:['==','id','__none__']
      });
      map.on('click','poi-circles', (e)=>{
        const f = e.features && e.features[0];
        if(!f) return;
        const id = f.properties && (f.properties as any).id;
        const poi = CAMPUS_POIS.find(p=>p.id===id);
        if(poi) onClick(poi);
        // update highlight
        map.setFilter('poi-circles-selected', ['==','id', id || '__none__']);
      });
  // Cursor
      map.on('mouseenter','poi-circles', ()=>{ map.getCanvas().style.cursor='pointer'; });
      map.on('mouseleave','poi-circles', ()=>{ map.getCanvas().style.cursor=''; });
    } else {
  // Refresh data
      const src = map.getSource(srcId) as mapboxgl.GeoJSONSource;
      const fc: GeoJSON.FeatureCollection<GeoJSON.Point, any> = {
        type:'FeatureCollection',
        features: CAMPUS_POIS.map(p=>({ type:'Feature', geometry:{ type:'Point', coordinates:p.coords }, properties:{ id:p.id, name:p.name, category:p.category } }))
      };
      src.setData(fc);
    }
  }

  function setPoiCategoryFilter(cat: string | null){
    if(!mapRef.current) return;
    const map = mapRef.current;
    if(map.getLayer('poi-circles')){
      if(!cat) map.setFilter('poi-circles', null as any);
      else map.setFilter('poi-circles', ['==','category', cat]);
    }
  }

  return { mapRef, isReady, error, setStyle, style, markersRef, addPoiMarkers, ensurePoiLayer, setPoiCategoryFilter, clearDomMarkers };
}
