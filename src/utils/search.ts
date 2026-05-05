import { CampusPOI } from '../data/campusPOIs';

export function scorePOI(poi: CampusPOI, query: string): number {
  const q = query.toLowerCase();
  const name = poi.name.toLowerCase();
  let score = 0;
  if (name === q) score += 100;
  if (name.startsWith(q)) score += 60;
  if (name.includes(q)) score += 30;
  if (poi.tags) {
    for (const t of poi.tags) if (t.toLowerCase().startsWith(q)) { score += 25; break; }
  }
  return score;
}

export function searchPOIs(pois: CampusPOI[], query: string, limit = 8): CampusPOI[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return pois
    .map(p => ({ p, s: scorePOI(p, q) }))
    .filter(r => r.s > 0)
    .sort((a,b) => b.s - a.s)
    .slice(0, limit)
    .map(r => r.p);
}
