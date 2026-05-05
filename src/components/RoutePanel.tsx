import React from 'react';
import { CampusPOI } from '../data/campusPOIs';

interface RouteStep { from:[number,number]; to:[number,number]; distanceMeters:number; direction:string }
interface Props {
  start: CampusPOI | null;
  end: CampusPOI | null;
  distanceM: number | null;
  durationSec: number | null;
  steps: RouteStep[];
  onReset: () => void;
  onSwap: () => void;
  active: boolean;
  onPrint?: () => void;
}

export const RoutePanel: React.FC<Props> = ({ start, end, distanceM, durationSec, steps, onReset, onSwap, active, onPrint }) => {
  if (!active) return null;
  return (
    <div className="route-panel">
      <div className="rp-row"><strong>Route</strong></div>
      <div className="rp-row"><span className="rp-label">Start:</span> {start ? start.name : <em>—</em>}</div>
      <div className="rp-row"><span className="rp-label">End:</span> {end ? end.name : <em>—</em>}</div>
      {distanceM != null && (
        <div className="rp-row"><span className="rp-label">Distance:</span> {(distanceM/1000).toFixed(2)} km</div>
      )}
      {durationSec != null && (
        <div className="rp-row"><span className="rp-label">ETA:</span> ~{Math.max(1,Math.round(durationSec/60))} min walk</div>
      )}
    {(start || end) && (
        <div className="rp-actions" style={{display:'flex', gap:6}}>
          <button className="btn" onClick={onSwap} disabled={!start || !end}>Swap</button>
      <button className="btn" onClick={onPrint} disabled={!start || !end}>Print</button>
          <button className="btn" onClick={onReset}>Reset</button>
        </div>
      )}
      {steps.length>0 && (
        <div style={{maxHeight:120, overflowY:'auto', marginTop:6, borderTop:'1px solid #e2e8f0', paddingTop:6}}>
          {steps.map((s,i)=>(
            <div key={i} style={{fontSize:11, lineHeight:1.25}}>
              {i+1}. {s.direction} {(s.distanceMeters).toFixed(0)}m
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
