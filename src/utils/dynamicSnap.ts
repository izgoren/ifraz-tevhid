import * as turf from '@turf/turf';
import L from 'leaflet';
import { ParcelGeometry } from '../types';

export type DynamicLineMode = 'auto' | 'edge' | 'cut' | 'boundary' | 'free';

export interface DynamicGuideLine {
  id: string;
  category: 'edge' | 'ortho' | 'cut' | 'boundary' | 'cardinal';
  label: string;
  color: string;
  p1: [number, number]; // [lng, lat] for rendering
  p2: [number, number]; // [lng, lat] for rendering
  originXY: [number, number];
  dirXY: [number, number]; // unit vector in local meters
  isSegment?: boolean;
  segLengthM?: number;
  bearingDeg: number;
}

export interface VertexSnapResult {
  lngLat: [number, number];
  activeLine: DynamicGuideLine | null;
  snappedToVertex: boolean;
  displacementM: number;
}

const EARTH_RADIUS_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert [lng, lat] to local conformal tangent-plane meters around origin.
 */
export function lngLatToLocalXY(
  pt: [number, number],
  origin: [number, number]
): [number, number] {
  const cosLat = Math.cos(origin[1] * DEG_TO_RAD);
  const x = (pt[0] - origin[0]) * DEG_TO_RAD * EARTH_RADIUS_M * cosLat;
  const y = (pt[1] - origin[1]) * DEG_TO_RAD * EARTH_RADIUS_M;
  return [x, y];
}

/**
 * Convert local tangent-plane meters back to [lng, lat].
 */
export function localXYToLngLat(
  xy: [number, number],
  origin: [number, number]
): [number, number] {
  const cosLat = Math.cos(origin[1] * DEG_TO_RAD);
  const lng = origin[0] + (xy[0] / (EARTH_RADIUS_M * cosLat)) * RAD_TO_DEG;
  const lat = origin[1] + (xy[1] / EARTH_RADIUS_M) * RAD_TO_DEG;
  return [lng, lat];
}

/**
 * Extract unique ring vertices (without closing duplicate) from Polygon or primary ring of MultiPolygon.
 */
export function extractEditableVertices(feature: ParcelGeometry): [number, number][] {
  let rawRing: number[][] = [];
  if (feature.geometry.type === 'Polygon') {
    rawRing = feature.geometry.coordinates[0] || [];
  } else if (feature.geometry.type === 'MultiPolygon') {
    rawRing = feature.geometry.coordinates[0]?.[0] || [];
  }
  if (rawRing.length < 3) return [];

  const first = rawRing[0];
  const last = rawRing[rawRing.length - 1];
  const isClosed =
    rawRing.length > 3 &&
    Math.abs(first[0] - last[0]) < 1e-10 &&
    Math.abs(first[1] - last[1]) < 1e-10;

  const verts = isClosed ? rawRing.slice(0, -1) : rawRing;
  return verts.map((c) => [c[0], c[1]]);
}

/**
 * Rebuild a closed ParcelGeometry with updated primary outer ring vertices.
 */
export function buildUpdatedParcelGeometry(
  original: ParcelGeometry,
  newVertices: [number, number][]
): ParcelGeometry {
  const closedRing: [number, number][] = [
    ...newVertices.map((v): [number, number] => [v[0], v[1]]),
    [newVertices[0][0], newVertices[0][1]]
  ];

  const cloned = JSON.parse(JSON.stringify(original)) as ParcelGeometry;
  if (cloned.geometry.type === 'Polygon') {
    cloned.geometry.coordinates[0] = closedRing;
  } else if (cloned.geometry.type === 'MultiPolygon') {
    if (!cloned.geometry.coordinates[0]) cloned.geometry.coordinates[0] = [];
    cloned.geometry.coordinates[0][0] = closedRing;
  }
  return cloned;
}

/**
 * Check whether polygon has self-intersections (kinks).
 */
export function hasSelfIntersection(feature: ParcelGeometry): boolean {
  try {
    if (feature.geometry.type === 'Polygon') {
      const kinks = turf.kinks(feature as any);
      return kinks.features.length > 0;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Extract all outer ring segments from a list of geometries (for boundary snapping).
 */
export function extractBoundarySegments(
  geometries: Array<{ id: string; label: string; feature: ParcelGeometry }>
): Array<{ a: [number, number]; b: [number, number]; sourceId: string; label: string }> {
  const segments: Array<{ a: [number, number]; b: [number, number]; sourceId: string; label: string }> = [];
  for (const item of geometries) {
    const verts = extractEditableVertices(item.feature);
    if (verts.length < 2) continue;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      segments.push({ a, b, sourceId: item.id, label: item.label });
    }
  }
  return segments;
}

/**
 * Compute bearing (0..180 normalized azimuth degrees, 0=North, 90=East) from local vector.
 */
function vectorToAzimuthDeg(dx: number, dy: number): number {
  const rad = Math.atan2(dx, dy); // North=0, clockwise
  const deg = (rad * RAD_TO_DEG + 360) % 360;
  return Math.round(deg * 10) / 10;
}

/**
 * Build all candidate dynamic guide lines for a vertex being dragged.
 */
export function buildDynamicGuideLines(params: {
  originVert: [number, number];
  prevVert: [number, number];
  nextVert: [number, number];
  cutAngleDeg: number;
  extentM: number;
  boundarySegments?: Array<{ a: [number, number]; b: [number, number]; sourceId: string; label: string }>;
  editingParcelId?: string;
}): DynamicGuideLine[] {
  const {
    originVert,
    prevVert,
    nextVert,
    cutAngleDeg,
    extentM,
    boundarySegments = [],
    editingParcelId
  } = params;

  const lines: DynamicGuideLine[] = [];
  const originXY: [number, number] = [0, 0];

  const makeInfiniteLine = (
    id: string,
    category: DynamicGuideLine['category'],
    label: string,
    color: string,
    anchorXY: [number, number],
    dirX: number,
    dirY: number
  ): DynamicGuideLine | null => {
    const len = Math.hypot(dirX, dirY);
    if (len < 1e-6) return null;
    const ux = dirX / len;
    const uy = dirY / len;
    const p1XY: [number, number] = [anchorXY[0] - ux * extentM, anchorXY[1] - uy * extentM];
    const p2XY: [number, number] = [anchorXY[0] + ux * extentM, anchorXY[1] + uy * extentM];
    return {
      id,
      category,
      label,
      color,
      p1: localXYToLngLat(p1XY, originVert),
      p2: localXYToLngLat(p2XY, originVert),
      originXY: anchorXY,
      dirXY: [ux, uy],
      isSegment: false,
      bearingDeg: vectorToAzimuthDeg(ux, uy)
    };
  };

  const prevXY = lngLatToLocalXY(prevVert, originVert);
  const nextXY = lngLatToLocalXY(nextVert, originVert);

  // 1. Önceki Kenar Doğrultusu (Prev -> Origin) ve 90° Dik
  const dx1 = originXY[0] - prevXY[0];
  const dy1 = originXY[1] - prevXY[1];
  const edge1Line = makeInfiniteLine(
    'edge-prev',
    'edge',
    'Önceki Kenar Hattı',
    '#22d3ee',
    prevXY,
    dx1,
    dy1
  );
  if (edge1Line) lines.push(edge1Line);

  const ortho1Line = makeInfiniteLine(
    'ortho-prev',
    'ortho',
    'Önceki Kenara 90° Dik Hat',
    '#a855f7',
    prevXY,
    -dy1,
    dx1
  );
  if (ortho1Line) lines.push(ortho1Line);

  // 2. Sonraki Kenar Doğrultusu (Next -> Origin) ve 90° Dik
  const dx2 = originXY[0] - nextXY[0];
  const dy2 = originXY[1] - nextXY[1];
  const edge2Line = makeInfiniteLine(
    'edge-next',
    'edge',
    'Sonraki Kenar Hattı',
    '#38bdf8',
    nextXY,
    dx2,
    dy2
  );
  if (edge2Line) lines.push(edge2Line);

  const ortho2Line = makeInfiniteLine(
    'ortho-next',
    'ortho',
    'Sonraki Kenara 90° Dik Hat',
    '#c084fc',
    nextXY,
    -dy2,
    dx2
  );
  if (ortho2Line) lines.push(ortho2Line);

  // 3. İfraz Kesim Açısı Ekseni ve Diki (cutAngleDeg = clockwise from North)
  const cutRad = cutAngleDeg * DEG_TO_RAD;
  const cutUx = Math.sin(cutRad);
  const cutUy = Math.cos(cutRad);

  const cutMainLine = makeInfiniteLine(
    'cut-main',
    'cut',
    `Kesim Açısı Hattı (${cutAngleDeg.toFixed(1)}°)`,
    '#f59e0b',
    originXY,
    cutUx,
    cutUy
  );
  if (cutMainLine) lines.push(cutMainLine);

  const cutPerpDeg = Math.round(((cutAngleDeg + 90) % 180) * 10) / 10;
  const cutPerpLine = makeInfiniteLine(
    'cut-perp',
    'cut',
    `Kesim Dik Hattı (${cutPerpDeg.toFixed(1)}°)`,
    '#fbbf24',
    originXY,
    -cutUy,
    cutUx
  );
  if (cutPerpLine) lines.push(cutPerpLine);

  // 4. Ana Parsel / Komşu Sınır Segmentleri
  boundarySegments.forEach((seg, idx) => {
    if (seg.sourceId === editingParcelId) return;
    const aXY = lngLatToLocalXY(seg.a, originVert);
    const bXY = lngLatToLocalXY(seg.b, originVert);
    const sdx = bXY[0] - aXY[0];
    const sdy = bXY[1] - aXY[1];
    const segLen = Math.hypot(sdx, sdy);
    if (segLen < 0.2) return;

    // Distance from originVert to segment; keep relevant boundary segments within reasonable radius
    const ux = sdx / segLen;
    const uy = sdy / segLen;
    const t = Math.max(0, Math.min(segLen, -aXY[0] * ux - aXY[1] * uy));
    const closestX = aXY[0] + t * ux;
    const closestY = aXY[1] + t * uy;
    const distToOrigin = Math.hypot(closestX, closestY);
    if (distToOrigin > extentM * 1.5) return;

    lines.push({
      id: `boundary-${seg.sourceId}-${idx}`,
      category: 'boundary',
      label: `${seg.label} Sınır Hattı`,
      color: '#10b981',
      p1: seg.a,
      p2: seg.b,
      originXY: aXY,
      dirXY: [ux, uy],
      isSegment: true,
      segLengthM: segLen,
      bearingDeg: vectorToAzimuthDeg(ux, uy)
    });
  });

  // 5. Kardinal Eksenler (K-G ve D-B)
  const northSouth = makeInfiniteLine('cardinal-ns', 'cardinal', 'Kuzey-Güney Ekseni', '#94a3b8', originXY, 0, 1);
  const eastWest = makeInfiniteLine('cardinal-ew', 'cardinal', 'Doğu-Batı Ekseni', '#94a3b8', originXY, 1, 0);
  if (northSouth) lines.push(northSouth);
  if (eastWest) lines.push(eastWest);

  return lines;
}

/**
 * Project cursor position onto candidate dynamic lines (or constrain to active mode rail).
 */
export function snapVertexToDynamicLines(params: {
  cursorLngLat: [number, number];
  originVert: [number, number];
  guideLines: DynamicGuideLine[];
  mode: DynamicLineMode;
  snapToleranceM: number;
  snapTargets?: [number, number][];
}): VertexSnapResult {
  const { cursorLngLat, originVert, guideLines, mode, snapToleranceM, snapTargets = [] } = params;
  const cursorXY = lngLatToLocalXY(cursorLngLat, originVert);

  // Free mode: no snapping
  if (mode === 'free') {
    return {
      lngLat: cursorLngLat,
      activeLine: null,
      snappedToVertex: false,
      displacementM: Math.hypot(cursorXY[0], cursorXY[1])
    };
  }

  // First check exact corner vertex snap in 'auto' mode
  if (mode === 'auto' && snapTargets.length > 0) {
    let nearestTarget: [number, number] | null = null;
    let nearestDist = Infinity;
    for (const tgt of snapTargets) {
      const tXY = lngLatToLocalXY(tgt, originVert);
      const d = Math.hypot(cursorXY[0] - tXY[0], cursorXY[1] - tXY[1]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestTarget = tgt;
      }
    }
    if (nearestTarget && nearestDist <= snapToleranceM * 0.85) {
      const nXY = lngLatToLocalXY(nearestTarget, originVert);
      return {
        lngLat: nearestTarget,
        activeLine: null,
        snappedToVertex: true,
        displacementM: Math.hypot(nXY[0], nXY[1])
      };
    }
  }

  // Filter guide lines by mode
  const candidates = guideLines.filter((line) => {
    if (mode === 'auto') return true;
    if (mode === 'edge') return line.category === 'edge' || line.category === 'ortho';
    if (mode === 'cut') return line.category === 'cut';
    if (mode === 'boundary') return line.category === 'boundary';
    return true;
  });

  // Fallback to all lines if boundary mode has no boundary segments
  const pool = candidates.length > 0 ? candidates : guideLines;

  let bestLine: DynamicGuideLine | null = null;
  let bestProjectedXY: [number, number] = cursorXY;
  let bestDist = Infinity;

  for (const line of pool) {
    const vx = cursorXY[0] - line.originXY[0];
    const vy = cursorXY[1] - line.originXY[1];
    let t = vx * line.dirXY[0] + vy * line.dirXY[1];

    if (line.isSegment && line.segLengthM !== undefined) {
      t = Math.max(0, Math.min(line.segLengthM, t));
    }

    const px = line.originXY[0] + t * line.dirXY[0];
    const py = line.originXY[1] + t * line.dirXY[1];
    const dist = Math.hypot(cursorXY[0] - px, cursorXY[1] - py);

    // Slight priority bias in auto mode: edge & boundary over cardinal
    const priorityPenalty =
      mode === 'auto' && line.category === 'cardinal'
        ? snapToleranceM * 0.25
        : mode === 'auto' && line.category === 'ortho'
        ? snapToleranceM * 0.1
        : 0;

    if (dist + priorityPenalty < bestDist) {
      bestDist = dist;
      bestLine = line;
      bestProjectedXY = [px, py];
    }
  }

  // In strict rail modes ('edge', 'cut', 'boundary'), always project onto the nearest rail!
  const isStrictMode = mode === 'edge' || mode === 'cut' || mode === 'boundary';
  if (bestLine && (isStrictMode || bestDist <= snapToleranceM)) {
    return {
      lngLat: localXYToLngLat(bestProjectedXY, originVert),
      activeLine: bestLine,
      snappedToVertex: false,
      displacementM: Math.hypot(bestProjectedXY[0], bestProjectedXY[1])
    };
  }

  return {
    lngLat: cursorLngLat,
    activeLine: null,
    snappedToVertex: false,
    displacementM: Math.hypot(cursorXY[0], cursorXY[1])
  };
}

/**
 * Compute ground meters corresponding to `pixelTolerance` screen pixels at a given LatLng & map zoom.
 */
export function getMeterToleranceForPixels(
  map: L.Map,
  latLng: [number, number],
  pixelTolerance: number = 18
): number {
  try {
    const centerPt = map.latLngToContainerPoint([latLng[1], latLng[0]]);
    const offsetLatLng = map.containerPointToLatLng(
      L.point(centerPt.x + pixelTolerance, centerPt.y)
    );
    const distM = map.distance([latLng[1], latLng[0]], offsetLatLng);
    return Math.max(0.15, distM);
  } catch {
    return 1.5;
  }
}
