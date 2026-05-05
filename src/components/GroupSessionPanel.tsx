import React, { useState } from 'react';

export interface GroupMember {
  id: string;
  name: string;
  location: [number, number];
  route: string[]; // POI ids or segment ids
}

export interface GroupSession {
  code: string;
  members: GroupMember[];
  targetPoiId: string;
}

export const GroupSessionPanel: React.FC<{
  session: GroupSession | null;
  selfId?: string;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
  onSetTarget: (poiId: string) => void;
}> = ({ session, selfId, onCreate, onJoin, onLeave, onSetTarget }) => {
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  return (
    <div className="group-session-panel" style={{
      minWidth: 220,
      maxWidth: 320,
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      padding: '18px 16px 14px 16px',
      fontSize: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      alignItems: 'stretch',
    }}>
      <div style={{fontWeight:600, fontSize:16, marginBottom:2, color:'#1a3978'}}>Group Navigation</div>
      {!session ? (
        <>
          <button className="btn" style={{marginBottom:8}} onClick={async()=>{
            setLoading(true); setError(null);
            try { await onCreate(); } catch(e:any){ setError(e?.message||'Error'); }
            setLoading(false);
          }} disabled={loading}>Create Session</button>
          <div style={{display:'flex', gap:6}}>
            <input
              type="text"
              placeholder="Enter code"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              style={{flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #d0d7e2', fontSize:13}}
              disabled={loading}
            />
            <button className="btn" onClick={async()=>{
              setLoading(true); setError(null);
              try { await onJoin(joinCode); } catch(e:any){ setError(e?.message||'Error'); }
              setLoading(false);
            }} disabled={!joinCode||loading} style={{padding:'6px 12px'}}>Join</button>
          </div>
          {error && <div style={{color:'#f44336', fontSize:13, marginTop:6}}>{error}</div>}
        </>
      ) : (
        <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span style={{fontWeight:500, fontSize:15}}>Session Code:</span>
            <span style={{fontFamily:'monospace', fontSize:15, color:'#0077ff'}}>{session.code}</span>
          </div>
          <button className="btn" style={{marginBottom:8, background:'#f44336', color:'#fff'}} onClick={async()=>{
            setLoading(true); setError(null);
            try { await onLeave(); } catch(e:any){ setError(e?.message||'Error'); }
            setLoading(false);
          }} disabled={loading}>Leave Session</button>
          {error && <div style={{color:'#f44336', fontSize:13, marginTop:6}}>{error}</div>}
          <div>
            <div style={{fontWeight:500, marginBottom:4}}>Members:</div>
            <ul style={{margin:0, paddingLeft:16, fontSize:13}}>
              {session.members.map(m => (
                <li key={m.id} style={{marginBottom:2}}>
                  {m.name} {selfId && m.id === selfId ? <span style={{color:'#0077ff'}}>(You)</span> : ''}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div style={{fontWeight:500, marginBottom:4}}>Target POI:</div>
            <span style={{fontSize:13}}>{session.targetPoiId || 'None'}</span>
          </div>
        </>
      )}
    </div>
  );
};
