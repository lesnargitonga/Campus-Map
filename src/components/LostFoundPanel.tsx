import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CAMPUS_POIS } from '../data/campusPOIs';
import { app, db } from '../firebase';
import { collection, addDoc, onSnapshot, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';

type ItemType = 'lost' | 'found';
type Category = 'Electronics' | 'ID/Docs' | 'Keys' | 'Books' | 'Clothing' | 'Other';

export interface LostFoundItem {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  category: Category;
  poiId: string; // location reference
  contact?: string;
  imageDataUrl?: string;
  createdAt?: any;
  resolved?: boolean;
  claimedBy?: string;
  claimedAt?: any;
  claimantContact?: string;
  claimNote?: string;
}

interface Props { onClose: () => void; onLocate?: (poiId: string) => void; inline?: boolean }

// Stable wrapper to avoid remounting children on each render
const RootWrap: React.FC<{ inline: boolean; children: React.ReactNode }> = ({ inline, children }) => (
  inline ? (
    <div style={panelInline}>{children}</div>
  ) : (
    <div style={overlay}><div style={panel}>{children}</div></div>
  )
);

export default function LostFoundPanel({ onClose, onLocate, inline }: Props) {
  const [type, setType] = useState<ItemType>('lost');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('Electronics');
  const [poiId, setPoiId] = useState('');
  const [contact, setContact] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [filterType, setFilterType] = useState<'all'|ItemType>('all');
  const [filterCat, setFilterCat] = useState<'all'|Category>('all');
  const [filterPoi, setFilterPoi] = useState<string>('all');
  const [backendReady, setBackendReady] = useState<boolean>(true);
  const [pendingLocal, setPendingLocal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');
  const [msgKind, setMsgKind] = useState<'info'|'warn'|'error'|'success'>('info');
  const [lastError, setLastError] = useState<string>('');
  // Claim UI state
  const [claimOpenId, setClaimOpenId] = useState<string | null>(null);
  const [claimName, setClaimName] = useState('');
  const [claimContact, setClaimContact] = useState('');
  const [claimNote, setClaimNote] = useState('');
  // Diagnostics UI removed
  const msgTimer = useRef<number | null>(null);
  // Pagination removed; list will scroll vertically in parent

  function flash(kind: 'info'|'warn'|'error'|'success', text: string, ms = 3000) {
    setMsgKind(kind);
    setMsg(text);
    if (msgTimer.current) { window.clearTimeout(msgTimer.current); }
    msgTimer.current = window.setTimeout(() => setMsg(''), ms);
  }
  // Remove undefined fields (Firestore rejects undefined) and normalize legacy keys
  function sanitizePayload<T extends Record<string, any>>(obj: T): Partial<T> {
    const out: any = {};
    // Normalize legacy typo imageDataUri -> imageDataUrl
    if ((obj as any).imageDataUri !== undefined) {
      if ((obj as any).imageDataUri) out.imageDataUrl = (obj as any).imageDataUri;
      // don't keep imageDataUri
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'imageDataUri') continue; // already handled/ignored
      if (v !== undefined) out[k] = v;
    }
    return out as Partial<T>;
  }

  // Lightweight store fallback using localStorage
  function loadLocal(): LostFoundItem[] {
    try { const raw = localStorage.getItem('lf_items'); if (raw) return JSON.parse(raw); } catch {}
    return [];
  }
  function saveLocal(list: LostFoundItem[]) {
    try { localStorage.setItem('lf_items', JSON.stringify(list)); } catch {}
  }
  function countPendingLocal(){ setPendingLocal(loadLocal().filter(x => !x.createdAt || typeof x.createdAt === 'number').length); }

  useEffect(() => {
    let unsub: any;
    try {
      const q = query(collection(db, 'lostfound'), orderBy('createdAt','desc'));
      unsub = onSnapshot(q, (snap) => {
        const arr: LostFoundItem[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) } as LostFoundItem));
  setItems(arr);
        setBackendReady(true);
        setLastError('');
        setLoading(false);
        // sync into local as a cache
        saveLocal(arr);
  countPendingLocal();
      }, (err) => {
        console.warn('LostFound Firestore error, using local cache', err);
        setBackendReady(false);
        try { setLastError((err?.code ? err.code + ': ' : '') + (err?.message || String(err))); } catch { setLastError('Unknown error'); }
        setItems(loadLocal());
        setLoading(false);
  countPendingLocal();
      });
    } catch (e) {
      console.warn('LostFound init failed, using local cache', e);
      setBackendReady(false);
      try { setLastError((e as any)?.message || String(e)); } catch { setLastError('Unknown error'); }
  setItems(loadLocal());
      setLoading(false);
  countPendingLocal();
    }
  return () => { if (unsub) try { unsub(); } catch {} };
  }, []);

  // When connectivity returns, try to publish pending local items automatically
  useEffect(() => {
    if (backendReady) {
      // slight delay to allow any UI state to settle
      const t = window.setTimeout(()=>{ publishLocalToCloud().catch(()=>{}); }, 800);
      return () => clearTimeout(t);
    }
  }, [backendReady]);

  function onImageChange(file?: File | null) {
    if (!file) { setImageDataUrl(undefined); return; }
  // Keep small so base64 string fits Firestore's 1 MiB doc limit
  if (file.size > 300_000) { alert('Please choose an image under 300 KB.'); return; }
    const fr = new FileReader();
    fr.onload = () => setImageDataUrl(fr.result as string);
    fr.readAsDataURL(file);
  }

  async function addItem() {
    if (!title.trim()) { flash('error','Title is required'); return; }
    if (!poiId) { flash('error','Please select a location'); return; }
    const item: Omit<LostFoundItem,'id'> = {
      type,
      title: title.trim(),
      description: description.trim(),
      category,
      poiId,
      contact: contact.trim() || undefined,
      imageDataUrl,
      createdAt: serverTimestamp(),
      resolved: false,
    };
    try {
      setIsSubmitting(true);
      // Always try online write first, even if reads failed
      try {
        const ref = await addDoc(collection(db, 'lostfound'), sanitizePayload(item) as any);
  // log removed for presentation
        flash('success','Item posted');
        setBackendReady(true);
        setLastError('');
      } catch (err: any) {
        console.warn('LostFound addDoc failed; caching locally', err);
        try { setLastError((err?.code ? err.code + ': ' : '') + (err?.message || String(err))); } catch {}
        const local = loadLocal();
        const id = String(Date.now());
        local.unshift({ id, ...(item as any), createdAt: Date.now() } as LostFoundItem);
        saveLocal(local); setItems(local);
        flash('warn','Couldn’t post online. Saved to this device');
        setBackendReady(false);
        countPendingLocal();
      }
      // reset form
      setTitle(''); setDescription(''); setContact(''); setImageDataUrl(undefined);
    } catch (e) {
      flash('warn','Couldn’t post online. Saved to this device');
      const local = loadLocal();
      const id = String(Date.now());
      local.unshift({ id, ...(item as any), createdAt: Date.now() } as LostFoundItem);
      saveLocal(local); setItems(local);
      setBackendReady(false);
  countPendingLocal();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markResolved(it: LostFoundItem) {
    // Open inline claim form for this item
    setClaimOpenId(it.id);
    setClaimName('');
    setClaimContact('');
    setClaimNote('');
  }

  async function submitClaim(it: LostFoundItem){
    const name = claimName.trim();
    const contact = claimContact.trim();
    const note = claimNote.trim();
    const payload: any = sanitizePayload({
      resolved: true,
      claimedBy: name || undefined,
      claimantContact: contact || undefined,
      claimNote: note || undefined,
      claimedAt: serverTimestamp(),
    });
    try {
      try {
        await updateDoc(doc(db, 'lostfound', it.id), payload);
        flash('success','Claim recorded');
        setBackendReady(true);
        setLastError('');
      } catch (err: any) {
        console.warn('LostFound claim update failed; caching locally', err);
        try { setLastError((err?.code ? err.code + ': ' : '') + (err?.message || String(err))); } catch {}
        const local = loadLocal().map(x => x.id===it.id ? {
          ...x,
          resolved: true,
          claimedBy: name || undefined,
          claimantContact: contact || undefined,
          claimNote: note || undefined,
          claimedAt: Date.now(),
        } : x);
        saveLocal(local); setItems(local);
        flash('warn','Offline: claim saved on this device');
        setBackendReady(false); countPendingLocal();
      }
    } catch (e) {
      flash('warn','Couldn’t update online. Saved to this device');
      const local = loadLocal().map(x => x.id===it.id ? {
        ...x,
        resolved: true,
        claimedBy: name || undefined,
        claimantContact: contact || undefined,
        claimNote: note || undefined,
        claimedAt: Date.now(),
      } : x);
      saveLocal(local); setItems(local); setBackendReady(false); countPendingLocal();
    } finally {
      setClaimOpenId(null); setClaimName(''); setClaimContact(''); setClaimNote('');
    }
  }

  async function publishLocalToCloud(){
    if (!backendReady) { flash('error','Still offline'); return; }
    try {
      const local = loadLocal();
      const unsent = local.filter(x => typeof x.createdAt === 'number');
      if (!unsent.length) { flash('info','Nothing to publish'); return; }
      let success = 0, failed = 0;
      for (const it of unsent) {
        const payload = { ...it } as any;
        // serverTimestamp for createdAt on cloud
        payload.createdAt = serverTimestamp();
        delete payload.id;
        // Normalize/sanitize before sending
        const cleaned = sanitizePayload(payload);
        try {
          await addDoc(collection(db,'lostfound'), cleaned as any);
          success++;
        } catch (e) {
          console.warn('Publish single item failed', e);
          failed++;
        }
      }
      // Clear local cache after successful push
      const kept = local.filter(x => !(typeof x.createdAt === 'number'));
      saveLocal(kept); setItems(kept);
      countPendingLocal();
      if (failed === 0) flash('success', `Published ${success} pending item${success===1?'':'s'}`);
      else flash('warn', `Published ${success}, ${failed} failed`);
    } catch(e){
      flash('error','Publish failed');
    }
  }

  async function deleteItem(it: LostFoundItem){
    if (!confirm('Delete this item? This cannot be undone.')) return;
    try{
      // If it's a local unsent item (createdAt numeric) just remove from local cache
      if (typeof it.createdAt === 'number'){
        const local = loadLocal().filter(x => x.id !== it.id);
        saveLocal(local); setItems(local); countPendingLocal(); flash('success','Deleted local item');
        return;
      }
      // Otherwise attempt cloud delete
      try{
        await deleteDoc(doc(db,'lostfound', it.id));
        // Optimistically remove from local view
        setItems(prev => prev.filter(x=>x.id!==it.id));
        flash('success','Item deleted');
      } catch (e){
        console.warn('Cloud delete failed, removing locally instead', e);
        const local = loadLocal().filter(x => x.id !== it.id);
        saveLocal(local); setItems(local); flash('warn','Delete queued locally'); setBackendReady(false);
      }
    } catch(e){ flash('error','Delete failed'); }
  }

  function clearLocal(){
    saveLocal([]); setItems([]); countPendingLocal();
    flash('success','Local data cleared');
  }

  async function testWrite(){
    try {
      const payload = sanitizePayload({
        type: 'lost',
        title: 'diag',
        description: 'diag',
        category: 'Other' as Category,
        poiId: CAMPUS_POIS[0]?.id || 'unknown',
        createdAt: serverTimestamp(),
        resolved: false,
      });
      const ref = await addDoc(collection(db, 'lostfound'), payload as any);
      await deleteDoc(doc(db, 'lostfound', ref.id));
      flash('success','Test write ok');
      setBackendReady(true); setLastError('');
    } catch (e: any) {
      const msg = (e?.code ? e.code + ': ' : '') + (e?.message || String(e));
      setLastError(msg); setBackendReady(false);
      flash('error','Test write failed');
    }
  }

  const filtered = useMemo(() => {
    return items.filter(it => (filterType==='all'||it.type===filterType)
      && (filterCat==='all'||it.category===filterCat)
      && (filterPoi==='all'||it.poiId===filterPoi));
  }, [items, filterType, filterCat, filterPoi]);

  // Pagination removed; filtered is rendered entirely

  return (
    <RootWrap inline={!!inline}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700}}>Lost & Found</div>
            <div style={{fontSize:12, color:'#6b7280'}}>Post a lost or found item and browse reports.</div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color: backendReady ? '#059669' : '#b45309'}}>
              <span style={{width:8, height:8, borderRadius:'50%', background: backendReady ? '#10b981' : '#f59e0b'}} />
              {backendReady ? 'Online' : 'Offline'}
            </span>
            {/* Manual publish button removed to keep UI simple; pending items still sync when possible */}
            {!inline && <button onClick={onClose} style={btn}>Close</button>}
          </div>
        </div>
    {msg && (
          <div style={{marginTop:8, background: msgKind==='error' ? '#fee2e2' : msgKind==='success' ? '#e6f4ea' : '#fef3c7', border:'1px solid', borderColor: msgKind==='error' ? '#ef4444' : msgKind==='success' ? '#22c55e' : '#f59e0b', padding:8, borderRadius:8, fontSize:12}}>
            {msg}
          </div>
        )}
        {!backendReady && (
          <div style={{marginTop:8, background:'#fef3c7', border:'1px solid #f59e0b', padding:8, borderRadius:8, fontSize:12}}>
      Offline mode: using local storage. Data won’t sync across devices until network is available.
      <div style={{marginTop:4, fontSize:11, color:'#6b7280'}}>Project: {(app.options as any)?.projectId || '(unknown)'}</div>
  {lastError && <div style={{marginTop:4, fontSize:11, color:'#92400e'}}>Error: {lastError}</div>}
          </div>
        )}

  {/* Diagnostics panel removed */}

  <div style={{display:'grid', gridTemplateColumns: inline ? '1fr' : '1fr 1fr', gap:12, marginTop:12}}>
          <div style={card}>
            <div style={cardTitle}>Report</div>
            <div style={{display:'flex', gap:8}}>
              <div style={{display:'inline-flex', background:'#f3f4f6', borderRadius:8, padding:2}}>
                <button onClick={()=>setType('lost')} style={{...segBtn, ...(type==='lost'?segActive:{} )}}>Lost</button>
                <button onClick={()=>setType('found')} style={{...segBtn, ...(type==='found'?segActive:{} )}}>Found</button>
              </div>
              <select value={category} onChange={e=>setCategory(e.target.value as Category)} style={input}>
                {['Electronics','ID/Docs','Keys','Books','Clothing','Other'].map(c=> <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} style={{...input, width:'100%', marginTop:8}} />
            <textarea placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)} style={{...input, width:'100%', height:70, marginTop:8}} />
            <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
              <select value={poiId} onChange={e=>setPoiId(e.target.value)} style={{...input, flex:1, minWidth:180}}>
                <option value="">Location (POI)</option>
                {CAMPUS_POIS.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input placeholder="Contact (optional)" value={contact} onChange={e=>setContact(e.target.value)} style={{...input, flex:1, minWidth:180}} />
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
              <input type="file" accept="image/*" onChange={e=>onImageChange(e.target.files?.[0])} />
              {imageDataUrl && <img src={imageDataUrl} alt="preview" style={{height:48, borderRadius:6, border:'1px solid #e5e7eb'}} />}
              {imageDataUrl && <button onClick={()=>setImageDataUrl(undefined)} style={{...btn, fontSize:11}}>Remove</button>}
            </div>
            <button onClick={addItem} disabled={isSubmitting || !title.trim() || !poiId} style={{...btn, width:'100%', marginTop:10, ...(isSubmitting?btnDisabled:{})}}>{isSubmitting ? 'Submitting…' : 'Submit'}</button>
          </div>

          <div style={card}>
            <div style={cardTitle}>Browse</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <select value={filterType} onChange={e=>setFilterType(e.target.value as any)} style={input}>
                <option value="all">All</option>
                <option value="lost">Lost</option>
                <option value="found">Found</option>
              </select>
              <select value={filterCat} onChange={e=>setFilterCat(e.target.value as any)} style={input}>
                <option value="all">Any Category</option>
                {['Electronics','ID/Docs','Keys','Books','Clothing','Other'].map(c=> <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterPoi} onChange={e=>setFilterPoi(e.target.value)} style={input}>
                <option value="all">Anywhere</option>
                {CAMPUS_POIS.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={()=>{ setFilterType('all'); setFilterCat('all'); setFilterPoi('all'); }} style={btn}>Reset</button>
            </div>
            <div style={{marginTop:8, fontSize:12, color:'#6b7280'}}>
              {loading ? 'Loading…' : `${filtered.length} item${filtered.length===1?'':'s'}`}
            </div>
            <div style={{marginTop:6, display:'grid', gridTemplateColumns:'1fr', gap:8}}>
              {filtered.map(it => (
                <div key={it.id} style={{border:'1px solid #e5e7eb', borderRadius:8, padding:8, display:'grid', gap:8, overflowX:'hidden'}}>
                  <div style={{display:'flex', gap:10, minWidth:0}}>
                    {it.imageDataUrl ? <img src={it.imageDataUrl} alt="item" style={{width:56, height:56, objectFit:'cover', borderRadius:6}}/> : <div style={{width:56, height:56, borderRadius:6, background:'#f3f4f6', display:'grid', placeItems:'center', fontSize:11}}>{it.type.toUpperCase()}</div>}
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:600, fontSize:13, wordBreak:'break-word', overflowWrap:'anywhere'}}>{it.title}</div>
                      <div style={{fontSize:12, color:'#374151', wordBreak:'break-word', overflowWrap:'anywhere'}}>{it.description || '\u00A0'}</div>
                      <div style={{fontSize:11, color:'#6b7280'}}>• {it.category} • {CAMPUS_POIS.find(p=>p.id===it.poiId)?.name || it.poiId}</div>
                    </div>
                  </div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-start'}}>
                    <button onClick={()=> onLocate && onLocate(it.poiId)} style={btn}>Locate</button>
                    <button onClick={()=>deleteItem(it)} style={{...btn, background:'#fff', borderColor:'#fca5a5'}}>Delete</button>
                    {!it.resolved ? (
                      claimOpenId===it.id ? null : (
                        <button onClick={()=>markResolved(it)} style={btn}>Claim</button>
                      )
                    ) : (
                      <span style={{fontSize:11, color:'#059669'}}>Resolved</span>
                    )}
                  </div>
                  {!it.resolved && claimOpenId===it.id && (
                    <div style={{display:'grid', gap:6, background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, padding:8, position:'relative'}}>
                      <div style={{fontSize:12, color:'#374151'}}>Claim this item</div>
                      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                        <input placeholder="Your name" value={claimName} onChange={e=>setClaimName(e.target.value)} style={{...input, flex:1}} />
                        <input placeholder="Contact (email/phone)" value={claimContact} onChange={e=>setClaimContact(e.target.value)} style={{...input, flex:1}} />
                      </div>
                      <textarea placeholder="Note (optional)" value={claimNote} onChange={e=>setClaimNote(e.target.value)} style={{...input, width:'100%', height:60}} />
                      <div style={{display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap', position:'sticky', bottom:0, background:'#f9fafb', paddingTop:8, margin:'0 -8px -8px', padding:'8px 8px', borderTop:'1px solid #e5e7eb', borderBottomLeftRadius:8, borderBottomRightRadius:8}}>
                        <button onClick={()=>submitClaim(it)} style={{...btn, background:'#e6f4ea', borderColor:'#86efac'}}>Submit Claim</button>
                        <button onClick={()=>setClaimOpenId(null)} style={{...btn, background:'#f3f4f6'}}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!loading && filtered.length===0 && <div style={{fontSize:12, color:'#6b7280'}}>No items match the filters.</div>}
            </div>
          </div>
        </div>
  </RootWrap>
  );
}

export {};

const overlay: React.CSSProperties = { position:'absolute', inset:0, background:'rgba(0,0,0,.35)', backdropFilter:'blur(2px)', display:'grid', placeItems:'center', zIndex: 50 };
const panel: React.CSSProperties = { width: 820, maxWidth:'95vw', background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.25)' };
const panelInline: React.CSSProperties = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12 };
const card: React.CSSProperties = { background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:12, padding:12 };
const cardTitle: React.CSSProperties = { fontWeight:600, fontSize:13, color:'#111827', marginBottom:8 };
const input: React.CSSProperties = { padding:'6px 8px', border:'1px solid #cbd5e1', borderRadius: 8, fontSize: 13 };
const btn: React.CSSProperties = { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, boxShadow: '0 1px 2px rgba(0,0,0,.06)' };
const btnDisabled: React.CSSProperties = { opacity: .6, cursor: 'not-allowed' };
const segBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderRadius: 6, color:'#374151' };
const segActive: React.CSSProperties = { background:'#fff', boxShadow:'0 1px 2px rgba(0,0,0,.06)', border:'1px solid #e5e7eb' };
