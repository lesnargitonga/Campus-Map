import { useEffect, useMemo, useRef, useState } from 'react';
import { CAMPUS_POIS, CATEGORIES, CATEGORY_COLORS, CampusPOI } from '../data/campusPOIs';
import { searchPOIs } from '../utils/search';

export interface POISearchProps {
  onSelect: (poi: CampusPOI) => void;
  activeCategory: string | null;
  setActiveCategory: (c: string | null) => void;
  selectedPoiId: string | null;
}

export function POISearch({ onSelect, activeCategory, setActiveCategory, selectedPoiId }: POISearchProps) {
  const [q, setQ] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filtered = useMemo(() => {
    const base = activeCategory ? CAMPUS_POIS.filter(p => p.category === activeCategory) : CAMPUS_POIS;
    if (!q) return base.slice(0, 10);
    return searchPOIs(base, q, 10);
  }, [q, activeCategory]);

  useEffect(() => { setFocusIdx(0); }, [q, activeCategory]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      const poi = filtered[focusIdx];
      if (poi) { onSelect(poi); setQ(poi.name); }
    }
  }

  return (
    <div className="poi-search-panel">
      <div className="search-row">
        <input
          ref={inputRef}
          value={q}
          placeholder="Search campus..."
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          className="search-input"
        />
        {q && <button className="clear-btn" onClick={() => setQ('')}>×</button>}
      </div>
      <div className="category-chips">
        <button
          className={!activeCategory ? 'chip active' : 'chip'}
          onClick={() => setActiveCategory(null)}>All</button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={activeCategory === c.key ? 'chip active' : 'chip'}
            onClick={() => setActiveCategory(c.key)}
          >
            <span className="chip-dot" style={{ background: CATEGORY_COLORS[c.key] }} />
            {c.label}
          </button>
        ))}
      </div>
      <ul className="results-list">
        {filtered.map((p, i) => (
          <li key={p.id}
            className={'result-item ' + (i === focusIdx ? 'focus ' : '') + (selectedPoiId === p.id ? 'selected ' : '')}
            onMouseEnter={() => setFocusIdx(i)}
            onClick={() => { onSelect(p); setQ(p.name); }}
          >
            <span className="r-name">{p.name}</span>
            <span className="r-cat">{p.category}</span>
          </li>
        ))}
        {filtered.length === 0 && <li className="empty">No matches</li>}
      </ul>
    </div>
  );
}
