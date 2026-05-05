import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

/**
 * Minimal, dependency-free map render for Safe Mode.
 * - Uses a public MapLibre style (no token) to guarantee a visible basemap.
 * - No Firestore, no geolocation, no POIs.
 */
export default function MapSafe() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [errMsg, setErrMsg] = useState<string>('');

  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
      setStatus('error');
      setErrMsg('WebGL not supported.');
      return;
    }
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
    try {
      const map = new mapboxgl.Map({
        container: ref.current,
        style: OSM_RASTER_STYLE as any,
        center: [36.8789, -1.2165],
        zoom: 15,
      });
      mapRef.current = map;
      map.on('load', () => { setStatus('ready'); setErrMsg(''); });
      map.on('error', (e: any) => {
        setStatus('error');
        const msg = e?.error?.message || e?.message || String(e);
        setErrMsg(msg);
        // Try resetting style once in case of transient issue
        try { map.setStyle(OSM_RASTER_STYLE as any); setStatus('loading'); } catch {}
      });
      return () => { try { map.remove(); } catch {} finally { mapRef.current = null; } };
    } catch (e: any) {
      setStatus('error');
      setErrMsg(e?.message || String(e));
    }
  }, []);

  return (
    <div style={{width:'100vw', height:'100vh', position:'relative'}}>
      <div ref={ref} style={{position:'absolute', inset:0}} />
      {status !== 'ready' && (
        <div style={{position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', background:'#14233b', color:'#fff', padding:'8px 12px', borderRadius:8, fontSize:12, boxShadow:'0 4px 14px -4px rgba(0,0,0,.35)'}}>
          {status === 'loading' ? 'Loading map…' : `Map error: ${errMsg}`}
        </div>
      )}
    </div>
  );
}
