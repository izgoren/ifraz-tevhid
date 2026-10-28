import * as turf from '@turf/turf';
import type { Feature, LineString, Polygon, MultiPolygon } from 'geojson';
import { ParcelGeometry } from '../types';

export interface ParsedKMLResult {
  parcel: ParcelGeometry;
  roadLines: Feature<LineString>[];
}

/**
 * Parses raw KML / GeoJSON text into clean Turf Polygon / MultiPolygon Feature and Road LineStrings.
 * Supports Placemarks, Folders, LineStrings (Yol Doğruları), and Polygons.
 */
export function parseKMLToGeoJSON(fileText: string): ParsedKMLResult {
  const trimmed = fileText.trim();
  
  // Attempt JSON/GeoJSON parsing
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      return parseGeoJSONObj(json);
    } catch (e) {
      console.warn('GeoJSON parsing failed, falling back to KML XML:', e);
    }
  }

  return parseKMLXML(fileText);
}

function parseGeoJSONObj(json: any): ParsedKMLResult {
  const polygons: Feature<Polygon>[] = [];
  const roadLines: Feature<LineString>[] = [];

  const processFeature = (feat: any) => {
    if (!feat || !feat.geometry) return;
    const geomType = feat.geometry.type;

    if (geomType === 'Polygon') {
      try {
        const poly = turf.rewind(feat, { reverse: false }) as Feature<Polygon>;
        polygons.push(poly);
      } catch (e) {
        console.warn('Poligon ayrıştırma hatası:', e);
      }
    } else if (geomType === 'LineString') {
      roadLines.push(feat as Feature<LineString>);
    } else if (geomType === 'MultiPolygon') {
      feat.geometry.coordinates.forEach((coords: any) => {
        try {
          const poly = turf.polygon(coords);
          polygons.push(poly);
        } catch (e) {}
      });
    }
  };

  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    json.features.forEach(processFeature);
  } else if (json.type === 'Feature') {
    processFeature(json);
  } else if (json.type === 'Polygon') {
    polygons.push(turf.polygon(json.coordinates));
  }

  if (polygons.length === 0) {
    throw new Error('Dosya içerisinde geçerli kapalı bir parsel geometrisi bulunamadı.');
  }

  // Sort by area descending to pick primary parcel
  polygons.sort((a, b) => turf.area(b) - turf.area(a));

  return {
    parcel: polygons[0] as ParcelGeometry,
    roadLines
  };
}

function parseKMLXML(kmlText: string): ParsedKMLResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('KML dosyası ayrıştırılamadı. Geçersiz XML formatı.');
  }

  const polygons: Feature<Polygon>[] = [];
  const roadLines: Feature<LineString>[] = [];

  const placemarks = xmlDoc.querySelectorAll('Placemark');

  if (placemarks && placemarks.length > 0) {
    placemarks.forEach((pm) => {
      const polygonNode = pm.querySelector('Polygon');
      const lineStringNode = pm.querySelector('LineString');

      if (polygonNode) {
        const coordNode = polygonNode.querySelector('coordinates');
        if (coordNode && coordNode.textContent) {
          const coords = parseCoordString(coordNode.textContent);
          if (coords.length >= 3) {
            ensureClosedRing(coords);
            try {
              const poly = turf.polygon([coords]);
              const cleanPoly = turf.rewind(poly, { reverse: false }) as Feature<Polygon>;
              polygons.push(cleanPoly);
            } catch (e) {}
          }
        }
      } else if (lineStringNode) {
        const coordNode = lineStringNode.querySelector('coordinates');
        if (coordNode && coordNode.textContent) {
          const coords = parseCoordString(coordNode.textContent);
          if (coords.length >= 2) {
            try {
              const line = turf.lineString(coords);
              roadLines.push(line);
            } catch (e) {}
          }
        }
      }
    });
  }

  // Fallback: If no placemark matched, search all <coordinates>
  if (polygons.length === 0) {
    const coordNodes = xmlDoc.querySelectorAll('coordinates');
    coordNodes.forEach((node) => {
      const text = node.textContent?.trim();
      if (!text) return;
      const coords = parseCoordString(text);
      if (coords.length >= 3) {
        ensureClosedRing(coords);
        try {
          const poly = turf.polygon([coords]);
          const cleanPoly = turf.rewind(poly, { reverse: false }) as Feature<Polygon>;
          polygons.push(cleanPoly);
        } catch (e) {}
      } else if (coords.length >= 2) {
        try {
          const line = turf.lineString(coords);
          roadLines.push(line);
        } catch (e) {}
      }
    });
  }

  if (polygons.length === 0) {
    throw new Error('KML içerisinde geçerli kapalı bir parsel geometrisi tespit edilemedi.');
  }

  polygons.sort((a, b) => turf.area(b) - turf.area(a));

  return {
    parcel: polygons[0] as ParcelGeometry,
    roadLines
  };
}

function parseCoordString(text: string): [number, number][] {
  const rawPoints = text.trim().split(/\s+/);
  const coords: [number, number][] = [];
  rawPoints.forEach((ptStr) => {
    const parts = ptStr.split(',').map((val) => parseFloat(val.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      coords.push([parts[0], parts[1]]);
    }
  });
  return coords;
}

function ensureClosedRing(coords: [number, number][]) {
  if (coords.length >= 3) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([first[0], first[1]]);
    }
  }
}

/**
 * Initial Default Cadastral Parcel Geometry.
 */
export const DEFAULT_PARCEL: ParcelGeometry = turf.polygon([
  [
    [32.8125, 39.7820],
    [32.8162, 39.7828],
    [32.8175, 39.7802],
    [32.8158, 39.7785],
    [32.8120, 39.7792],
    [32.8125, 39.7820]
  ]
]) as ParcelGeometry;
