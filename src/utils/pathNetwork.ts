/**
 * Deprecated: Local walkway router removed. Use Mapbox Directions instead.
 * This stub remains only to avoid breaking imports during migration.
 */

export type Coord = [number, number];
export interface PathResult {
  path: Coord[];
  distanceMeters: number;
  durationSec: number;
  steps: any[];
}
export interface RouteOptions {
  avoidTypes?: string[];
  blockedUndirected?: [string, string][];
}

export function computeCampusRoute(start: Coord, end: Coord, _opts: RouteOptions = {}): PathResult {
  return { path: [start, end], distanceMeters: 0, durationSec: 0, steps: [] };
}

export function getSegments(): any[] {
  return [];
}
