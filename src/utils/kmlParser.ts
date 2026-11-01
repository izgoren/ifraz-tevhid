import * as turf from '@turf/turf';
import type { Feature, LineString, Polygon, MultiPolygon } from 'geojson';
import { ParcelGeometry } from '../types';
import { extractCadastralInfo, CadastralInfo } from './cadastralLocation';

export interface ParsedPlacemarkParcel {
  id: string;
  name: string;
  geometry: ParcelGeometry;
  cadastralInfo: Partial<CadastralInfo>;
  rawProperties: Record<string, string>;
  areaM2: number;
}

export interface ParsedKMLResult {
  parcel: ParcelGeometry;
  allParcels: ParsedPlacemarkParcel[];
  roadLines: Feature<LineString>[];
  cadastralInfo?: Partial<CadastralInfo>;
}

/**
 * Extracts raw SimpleData, Data, and ExtendedData attributes from a KML Placemark element.
 */
function extractPlacemarkAttributes(
  pm: Element,
  fileCadastralFallback?: Partial<CadastralInfo>
): { cadastral: Partial<CadastralInfo>; raw: Record<string, string>; name: string } {
  const raw: Record<string, string> = {};
  const cadastral: Partial<CadastralInfo> = { ...fileCadastralFallback };

  const nameEl = pm.querySelector('name');
  const name = nameEl?.textContent?.trim() || '';
  if (name) raw['NAME'] = name;

  // 1. SimpleData tags in SchemaData/ExtendedData (TKGM Megsis standard)
  const simpleDataList = pm.querySelectorAll('SimpleData');
  simpleDataList.forEach((sd) => {
    const attrName = sd.getAttribute('name') || '';
    const textVal = sd.textContent?.trim() || '';
    if (attrName && textVal) {
      raw[attrName] = textVal;
      const upper = attrName.toUpperCase();
      if ((upper === 'IL' || upper === 'İL')) cadastral.il = textVal;
      else if ((upper === 'ILCE' || upper === 'İLÇE')) cadastral.ilce = textVal;
      else if ((upper === 'MAHALLE' || upper === 'MAHALLE_ADI' || upper === 'KOY' || upper === 'KÖY')) cadastral.mahalle = textVal;
      else if ((upper === 'ADA' || upper === 'ADANO' || upper === 'ADA_NO')) cadastral.adaNo = textVal;
      else if ((upper === 'PARSEL' || upper === 'PARSELNO' || upper === 'PARSEL_NO')) cadastral.parselNo = textVal;
      else if ((upper === 'MEVKII' || upper === 'MEVKİ')) cadastral.mevkii = textVal;
      else if ((upper === 'NITELIK' || upper === 'NİTELİK' || upper === 'VASIF')) cadastral.nitelik = textVal;
      else if ((upper === 'ALAN' || upper === 'TAPUALAN' || upper === 'TAPU_ALANI')) {
        const num = parseFloat(textVal.replace(',', '.'));
        if (!isNaN(num)) cadastral.tapuAlaniM2 = num;
      }
    }
  });

  // 2. Data tags in ExtendedData
  const dataList = pm.querySelectorAll('Data');
  dataList.forEach((d) => {
    const attrName = d.getAttribute('name') || '';
    const valEl = d.querySelector('value');
    const textVal = (valEl?.textContent || d.textContent)?.trim() || '';
    if (attrName && textVal) {
      raw[attrName] = textVal;
      const upper = attrName.toUpperCase();
      if ((upper === 'IL' || upper === 'İL') && !cadastral.il) cadastral.il = textVal;
      else if ((upper === 'ILCE' || upper === 'İLÇE') && !cadastral.ilce) cadastral.ilce = textVal;
      else if ((upper === 'MAHALLE' || upper === 'MAHALLE_ADI') && !cadastral.mahalle) cadastral.mahalle = textVal;
      else if ((upper === 'ADA' || upper === 'ADANO' || upper === 'ADA_NO') && !cadastral.adaNo) cadastral.adaNo = textVal;
      else if ((upper === 'PARSEL' || upper === 'PARSELNO' || upper === 'PARSEL_NO') && !cadastral.parselNo) cadastral.parselNo = textVal;
    }
  });

  // 3. Fallback from placemark name (e.g. "1042/18" or "1042-18")
  if (name && (!cadastral.adaNo || !cadastral.parselNo)) {
    const slash = name.match(/(\d+)\s*[/_-]\s*(\d+)/);
    if (slash) {
      if (!cadastral.adaNo) cadastral.adaNo = slash[1];
      if (!cadastral.parselNo) cadastral.parselNo = slash[2];
    }
  }

  return { cadastral, raw, name };
}

/**
 * Extracts attributes from GeoJSON Feature properties.
 */
function extractGeoJSONFeatureAttributes(
  feat: any,
  fileCadastralFallback?: Partial<CadastralInfo>
): { cadastral: Partial<CadastralInfo>; raw: Record<string, string>; name: string } {
  const raw: Record<string, string> = {};
  const cadastral: Partial<CadastralInfo> = { ...fileCadastralFallback };
  const props = feat.properties || {};
  let name = props.name || props.NAME || '';

  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    const strVal = String(v).trim();
    raw[k] = strVal;
    const upper = k.trim().toUpperCase();
    if ((upper === 'IL' || upper === 'İL')) cadastral.il = strVal;
    else if ((upper === 'ILCE' || upper === 'İLÇE')) cadastral.ilce = strVal;
    else if ((upper === 'MAHALLE' || upper === 'MAHALLE_ADI')) cadastral.mahalle = strVal;
    else if ((upper === 'ADA' || upper === 'ADANO' || upper === 'ADA_NO')) cadastral.adaNo = strVal;
    else if ((upper === 'PARSEL' || upper === 'PARSELNO' || upper === 'PARSEL_NO')) cadastral.parselNo = strVal;
    else if ((upper === 'MEVKII' || upper === 'MEVKİ')) cadastral.mevkii = strVal;
    else if ((upper === 'NITELIK' || upper === 'NİTELİK' || upper === 'VASIF')) cadastral.nitelik = strVal;
    else if ((upper === 'ALAN' || upper === 'TAPUALAN')) {
      const num = parseFloat(strVal.replace(',', '.'));
      if (!isNaN(num)) cadastral.tapuAlaniM2 = num;
    }
  }

  if (name && (!cadastral.adaNo || !cadastral.parselNo)) {
    const slash = name.match(/(\d+)\s*[/_-]\s*(\d+)/);
    if (slash) {
      if (!cadastral.adaNo) cadastral.adaNo = slash[1];
      if (!cadastral.parselNo) cadastral.parselNo = slash[2];
    }
  }

  return { cadastral, raw, name };
}

/**
 * Parses raw KML / GeoJSON text into clean Turf Polygon / MultiPolygon Features,
 * extracts per-Placemark attributes and road lines.
 */
export function parseKMLToGeoJSON(fileText: string, fileName?: string): ParsedKMLResult {
  const trimmed = fileText.trim();
  const fileCadastral = extractCadastralInfo(fileText, fileName);

  // Attempt JSON/GeoJSON parsing
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      return parseGeoJSONObj(json, fileCadastral, fileName);
    } catch (e) {
      console.warn('GeoJSON parsing failed, falling back to KML XML:', e);
    }
  }

  return parseKMLXML(fileText, fileCadastral, fileName);
}

function parseGeoJSONObj(json: any, fileCadastral: Partial<CadastralInfo>, fileName?: string): ParsedKMLResult {
  const allParcels: ParsedPlacemarkParcel[] = [];
  const roadLines: Feature<LineString>[] = [];

  const processFeature = (feat: any, idx: number) => {
    if (!feat || !feat.geometry) return;
    const geomType = feat.geometry.type;

    if (geomType === 'Polygon') {
      try {
        const poly = turf.rewind(feat, { reverse: false }) as Feature<Polygon>;
        const area = turf.area(poly);
        const { cadastral, raw, name } = extractGeoJSONFeatureAttributes(feat, fileCadastral);
        allParcels.push({
          id: `geojson-${idx}-${Date.now()}`,
          name: name || (cadastral.adaNo && cadastral.parselNo ? `${cadastral.adaNo}/${cadastral.parselNo}` : `Parsel ${idx + 1}`),
          geometry: poly,
          cadastralInfo: cadastral,
          rawProperties: raw,
          areaM2: area
        });
      } catch (e) {
        console.warn('Poligon ayrıştırma hatası:', e);
      }
    } else if (geomType === 'LineString') {
      roadLines.push(feat as Feature<LineString>);
    } else if (geomType === 'MultiPolygon') {
      feat.geometry.coordinates.forEach((coords: any, subIdx: number) => {
        try {
          const poly = turf.polygon(coords);
          const area = turf.area(poly);
          const { cadastral, raw, name } = extractGeoJSONFeatureAttributes(feat, fileCadastral);
          allParcels.push({
            id: `geojson-multi-${idx}-${subIdx}-${Date.now()}`,
            name: name || (cadastral.adaNo && cadastral.parselNo ? `${cadastral.adaNo}/${cadastral.parselNo}` : `Parsel ${idx + 1}.${subIdx + 1}`),
            geometry: poly,
            cadastralInfo: cadastral,
            rawProperties: raw,
            areaM2: area
          });
        } catch (e) {}
      });
    }
  };

  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    json.features.forEach((f: any, i: number) => processFeature(f, i));
  } else if (json.type === 'Feature') {
    processFeature(json, 0);
  } else if (json.type === 'Polygon') {
    const poly = turf.polygon(json.coordinates);
    allParcels.push({
      id: `geojson-poly-${Date.now()}`,
      name: fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Parsel 1',
      geometry: poly,
      cadastralInfo: fileCadastral,
      rawProperties: {},
      areaM2: turf.area(poly)
    });
  }

  if (allParcels.length === 0) {
    throw new Error('Dosya içerisinde geçerli kapalı bir parsel geometrisi bulunamadı.');
  }

  // Sort descending by area
  allParcels.sort((a, b) => b.areaM2 - a.areaM2);

  return {
    parcel: allParcels[0].geometry,
    allParcels,
    roadLines,
    cadastralInfo: allParcels[0].cadastralInfo
  };
}

function parseKMLXML(kmlText: string, fileCadastral: Partial<CadastralInfo>, fileName?: string): ParsedKMLResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('KML dosyası ayrıştırılamadı. Geçersiz XML formatı.');
  }

  const allParcels: ParsedPlacemarkParcel[] = [];
  const roadLines: Feature<LineString>[] = [];

  const placemarks = xmlDoc.querySelectorAll('Placemark');

  if (placemarks && placemarks.length > 0) {
    placemarks.forEach((pm, idx) => {
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
              const area = turf.area(cleanPoly);
              const { cadastral, raw, name } = extractPlacemarkAttributes(pm, fileCadastral);
              allParcels.push({
                id: `kml-pm-${idx}-${Date.now()}`,
                name: name || (cadastral.adaNo && cadastral.parselNo ? `${cadastral.adaNo}/${cadastral.parselNo}` : `Parsel ${idx + 1}`),
                geometry: cleanPoly,
                cadastralInfo: cadastral,
                rawProperties: raw,
                areaM2: area
              });
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
  if (allParcels.length === 0) {
    const coordNodes = xmlDoc.querySelectorAll('coordinates');
    coordNodes.forEach((node, idx) => {
      const text = node.textContent?.trim();
      if (!text) return;
      const coords = parseCoordString(text);
      if (coords.length >= 3) {
        ensureClosedRing(coords);
        try {
          const poly = turf.polygon([coords]);
          const cleanPoly = turf.rewind(poly, { reverse: false }) as Feature<Polygon>;
          const area = turf.area(cleanPoly);
          allParcels.push({
            id: `kml-coord-${idx}-${Date.now()}`,
            name: fileName ? fileName.replace(/\.[^/.]+$/, '') : `Parsel ${idx + 1}`,
            geometry: cleanPoly,
            cadastralInfo: fileCadastral,
            rawProperties: {},
            areaM2: area
          });
        } catch (e) {}
      } else if (coords.length >= 2) {
        try {
          const line = turf.lineString(coords);
          roadLines.push(line);
        } catch (e) {}
      }
    });
  }

  if (allParcels.length === 0) {
    throw new Error('KML içerisinde geçerli kapalı bir parsel geometrisi tespit edilemedi.');
  }

  allParcels.sort((a, b) => b.areaM2 - a.areaM2);

  return {
    parcel: allParcels[0].geometry,
    allParcels,
    roadLines,
    cadastralInfo: allParcels[0].cadastralInfo
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
