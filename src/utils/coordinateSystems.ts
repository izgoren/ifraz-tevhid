export type CoordinateSystemId = 'TUREF_TM3' | 'TUREF_UTM6' | 'WGS84';

export interface TMCoordinateResult {
  sagaY: number; // Easting (Sağa / Y in Turkish surveying)
  yukariX: number; // Northing (Yukarı / X in Turkish surveying)
  centralMeridian: number; // DOM (e.g. 27, 30, 33, 36, 39, 42, 45)
  zoneLabel: string; // e.g. "TM33 (DOM 33°)" or "Zone 36N"
  epsg: string; // e.g. "EPSG:5255"
}

export interface FormattedCoordinate {
  system: CoordinateSystemId;
  xLabel: string;
  yLabel: string;
  xFormatted: string;
  yFormatted: string;
  zoneLabel: string;
  epsg: string;
  sagaY?: number;
  yukariX?: number;
  lng: number;
  lat: number;
}

// GRS80 Ellipsoid constants (official TUREF / ITRF96 datum)
const GRS80_A = 6378137.0;
const GRS80_F = 1 / 298.257222101;
const GRS80_E2 = 2 * GRS80_F - GRS80_F * GRS80_F;
const GRS80_EP2 = GRS80_E2 / (1 - GRS80_E2);

export const TURKEY_TM3_DOMS = [27, 30, 33, 36, 39, 42, 45] as const;

/**
 * Returns the nearest standard 3-degree TUREF Central Meridian (DOM) for a longitude.
 */
export function getAutoTurefDom(lng: number): number {
  const nearest = Math.round(lng / 3) * 3;
  return nearest;
}

/**
 * Returns EPSG code for TUREF TM 3-degree zones (EPSG:5253 .. EPSG:5259)
 */
export function getTurefTm3Epsg(dom: number): string {
  const map: Record<number, string> = {
    27: 'EPSG:5253',
    30: 'EPSG:5254',
    33: 'EPSG:5255',
    36: 'EPSG:5256',
    39: 'EPSG:5257',
    42: 'EPSG:5258',
    45: 'EPSG:5259'
  };
  return map[dom] || `TUREF TM${dom}`;
}

/**
 * Returns UTM 6-degree zone number and central meridian
 */
export function getUtmZoneInfo(lng: number): { zone: number; centralMeridian: number; epsg: string } {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const centralMeridian = (zone - 1) * 6 - 180 + 3;
  const turefUtmMap: Record<number, string> = {
    35: 'EPSG:5260',
    36: 'EPSG:5261',
    37: 'EPSG:5262',
    38: 'EPSG:5263'
  };
  return {
    zone,
    centralMeridian,
    epsg: turefUtmMap[zone] || `EPSG:${32600 + zone}`
  };
}

/**
 * High-precision Transverse Mercator forward projection on GRS80 ellipsoid (Redfearn/Krüger series).
 * Accurate to < 1 mm within +/- 3 degrees of central meridian.
 */
export function latLngToTM(
  latDeg: number,
  lngDeg: number,
  centralMeridianDeg: number,
  scaleFactor = 1.0,
  falseEasting = 500000.0,
  falseNorthing = 0.0
): { sagaY: number; yukariX: number } {
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lngDeg * Math.PI) / 180;
  const lam0 = (centralMeridianDeg * Math.PI) / 180;
  const dLam = lam - lam0;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const T = tanPhi * tanPhi;
  const C = GRS80_EP2 * cosPhi * cosPhi;
  const A = cosPhi * dLam;

  const N = GRS80_A / Math.sqrt(1 - GRS80_E2 * sinPhi * sinPhi);

  // Meridional arc M
  const e2 = GRS80_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M =
    GRS80_A *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));

  const A2 = A * A;
  const A3 = A2 * A;
  const A4 = A3 * A;
  const A5 = A4 * A;
  const A6 = A5 * A;

  const easting =
    falseEasting +
    scaleFactor *
      N *
      (A +
        ((1 - T + C) * A3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * GRS80_EP2) * A5) / 120);

  const northing =
    falseNorthing +
    scaleFactor *
      (M +
        N *
          tanPhi *
          (A2 / 2 +
            ((5 - T + 9 * C + 4 * C * C) * A4) / 24 +
            ((61 - 58 * T + T * T + 600 * C - 330 * GRS80_EP2) * A6) / 720));

  return {
    sagaY: Math.round(easting * 100) / 100,
    yukariX: Math.round(northing * 100) / 100
  };
}

/**
 * Converts WGS84 geographic (lng, lat) to TUREF TM 3° (Gauss-Krüger k0 = 1.0)
 */
export function toTurefTM3(lng: number, lat: number, forcedDom?: number): TMCoordinateResult {
  const dom = forcedDom ?? getAutoTurefDom(lng);
  const { sagaY, yukariX } = latLngToTM(lat, lng, dom, 1.0, 500000.0, 0.0);
  return {
    sagaY,
    yukariX,
    centralMeridian: dom,
    zoneLabel: `TM${dom} (DOM ${dom}°)`,
    epsg: getTurefTm3Epsg(dom)
  };
}

/**
 * Converts WGS84 geographic (lng, lat) to TUREF UTM 6° (k0 = 0.9996)
 */
export function toTurefUTM6(lng: number, lat: number): TMCoordinateResult {
  const { zone, centralMeridian, epsg } = getUtmZoneInfo(lng);
  const { sagaY, yukariX } = latLngToTM(lat, lng, centralMeridian, 0.9996, 500000.0, 0.0);
  return {
    sagaY,
    yukariX,
    centralMeridian,
    zoneLabel: `Dilim ${zone}N (DOM ${centralMeridian}°)`,
    epsg
  };
}

/**
 * Formats a coordinate point in the selected coordinate system.
 */
export function formatCoordinateInSystem(
  lng: number,
  lat: number,
  system: CoordinateSystemId,
  forcedDom?: number
): FormattedCoordinate {
  if (system === 'TUREF_TM3') {
    const res = toTurefTM3(lng, lat, forcedDom);
    return {
      system,
      xLabel: 'Sağa (Y)',
      yLabel: 'Yukarı (X)',
      xFormatted: res.sagaY.toFixed(2),
      yFormatted: res.yukariX.toFixed(2),
      zoneLabel: res.zoneLabel,
      epsg: res.epsg,
      sagaY: res.sagaY,
      yukariX: res.yukariX,
      lng,
      lat
    };
  }

  if (system === 'TUREF_UTM6') {
    const res = toTurefUTM6(lng, lat);
    return {
      system,
      xLabel: 'Sağa (E)',
      yLabel: 'Yukarı (N)',
      xFormatted: res.sagaY.toFixed(2),
      yFormatted: res.yukariX.toFixed(2),
      zoneLabel: res.zoneLabel,
      epsg: res.epsg,
      sagaY: res.sagaY,
      yukariX: res.yukariX,
      lng,
      lat
    };
  }

  return {
    system: 'WGS84',
    xLabel: 'Boylam (λ)',
    yLabel: 'Enlem (φ)',
    xFormatted: lng.toFixed(6),
    yFormatted: lat.toFixed(6),
    zoneLabel: 'WGS84 Coğrafi',
    epsg: 'EPSG:4326',
    lng,
    lat
  };
}

export function getCoordinateSystemDisplayName(system: CoordinateSystemId): string {
  switch (system) {
    case 'TUREF_TM3':
      return 'TUREF (TM 3°)';
    case 'TUREF_UTM6':
      return 'TUREF (UTM 6°)';
    case 'WGS84':
      return 'WGS84 (Coğrafi)';
  }
}
