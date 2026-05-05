import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

export interface UserLocationState {
  markerRef: React.MutableRefObject<mapboxgl.Marker | null>;
  hasFix: boolean;
  accuracy: number | null;
  enabled: boolean;
  setEnabled: (v:boolean)=>void;
}

export function useUserLocation(mapRef: React.MutableRefObject<mapboxgl.Map | null>): UserLocationState {
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [hasFix, setHasFix] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<boolean>(!!navigator.geolocation);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(pos => {
      setHasFix(true);
      setAccuracy(pos.coords.accuracy || null);
      const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      if (!mapRef.current) return;
      if (!markerRef.current) {
        const el = document.createElement('div');
        el.className = 'user-marker';
        markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(mapRef.current);
      } else {
        markerRef.current.setLngLat(lngLat);
      }
    }, err => { console.warn('Geolocation error', err); }, { enableHighAccuracy: true, timeout: 15000 });

    return () => { navigator.geolocation.clearWatch(watchId); };
  }, [enabled]);

  return { markerRef, hasFix, accuracy, enabled, setEnabled };
}
