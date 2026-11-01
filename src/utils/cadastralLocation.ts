import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

export interface CadastralInfo {
  il: string;
  ilce: string;
  mahalle: string;
  adaNo: string;
  parselNo: string;
  mevkii?: string;
  nitelik?: string;
  tapuAlaniM2?: number;
  source?: 'file' | 'location' | 'manual';
}

// Bounding box approximation for Turkish Provinces (lngMin, latMin, lngMax, latMax)
interface ProvinceBox {
  name: string;
  defaultDistrict: string;
  bbox: [number, number, number, number];
}

const TURKEY_PROVINCES: ProvinceBox[] = [
  { name: 'Ankara', defaultDistrict: 'Gölbaşı', bbox: [31.85, 39.15, 33.45, 40.55] },
  { name: 'İstanbul', defaultDistrict: 'Kadıköy', bbox: [27.95, 40.80, 29.95, 41.60] },
  { name: 'İzmir', defaultDistrict: 'Urla', bbox: [26.25, 37.85, 28.45, 39.35] },
  { name: 'Bursa', defaultDistrict: 'Nilüfer', bbox: [28.20, 39.60, 29.95, 40.60] },
  { name: 'Antalya', defaultDistrict: 'Muratpaşa', bbox: [29.25, 36.15, 32.55, 37.55] },
  { name: 'Konya', defaultDistrict: 'Selçuklu', bbox: [31.25, 36.85, 34.05, 39.25] },
  { name: 'Adana', defaultDistrict: 'Seyhan', bbox: [34.75, 36.55, 36.35, 38.05] },
  { name: 'Muğla', defaultDistrict: 'Bodrum', bbox: [27.20, 36.50, 29.70, 37.50] },
  { name: 'Balıkesir', defaultDistrict: 'Karesi', bbox: [26.60, 39.20, 28.50, 40.60] },
  { name: 'Çanakkale', defaultDistrict: 'Merkez', bbox: [25.60, 39.45, 27.50, 40.75] },
  { name: 'Eskişehir', defaultDistrict: 'Tepebaşı', bbox: [30.15, 39.10, 32.10, 40.15] },
  { name: 'Kocaeli', defaultDistrict: 'İzmit', bbox: [29.35, 40.55, 30.35, 41.20] },
  { name: 'Sakarya', defaultDistrict: 'Adapazarı', bbox: [29.95, 40.35, 30.95, 41.20] },
  { name: 'Tekirdağ', defaultDistrict: 'Süleymanpaşa', bbox: [26.85, 40.60, 28.15, 41.60] },
  { name: 'Edirne', defaultDistrict: 'Merkez', bbox: [26.05, 40.50, 27.05, 42.15] },
  { name: 'Aydın', defaultDistrict: 'Kuşadası', bbox: [27.05, 37.40, 28.85, 38.10] },
  { name: 'Manisa', defaultDistrict: 'Yunusemre', bbox: [27.20, 38.25, 29.10, 39.40] },
  { name: 'Kayseri', defaultDistrict: 'Melikgazi', bbox: [34.90, 38.15, 36.85, 39.25] },
  { name: 'Mersin', defaultDistrict: 'Yenişehir', bbox: [32.55, 36.00, 35.15, 37.45] },
  { name: 'Samsun', defaultDistrict: 'Atakum', bbox: [35.05, 40.85, 37.25, 41.75] },
  { name: 'Trabzon', defaultDistrict: 'Ortahisar', bbox: [39.15, 40.50, 40.45, 41.20] },
  { name: 'Gaziantep', defaultDistrict: 'Şahinbey', bbox: [36.45, 36.65, 37.95, 37.45] },
  { name: 'Diyarbakır', defaultDistrict: 'Kayapınar', bbox: [39.95, 37.55, 41.25, 38.85] },
  { name: 'Şanlıurfa', defaultDistrict: 'Haliliye', bbox: [37.85, 36.65, 40.25, 37.85] },
  { name: 'Denizli', defaultDistrict: 'Pamukkale', bbox: [28.65, 37.20, 29.85, 38.45] }
];

/**
 * Gets the Turkish province and district from geographic coordinates (longitude, latitude).
 */
export function getProvinceFromCoordinates(lng: number, lat: number): { il: string; ilce: string } {
  // Check bounds
  for (const prov of TURKEY_PROVINCES) {
    const [minLng, minLat, maxLng, maxLat] = prov.bbox;
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
      return { il: prov.name, ilce: prov.defaultDistrict };
    }
  }

  // Fallback defaults for Turkey
  if (lat >= 35.8 && lat <= 42.2 && lng >= 25.6 && lng <= 44.8) {
    if (lng > 38.0) return { il: 'Diyarbakır', ilce: 'Merkez' };
    if (lng > 35.0) return { il: 'Kayseri', ilce: 'Melikgazi' };
    if (lat > 40.5) return { il: 'İstanbul', ilce: 'Kadıköy' };
    return { il: 'Ankara', ilce: 'Gölbaşı' };
  }

  return { il: 'Ankara', ilce: 'Gölbaşı' };
}

/**
 * Extracts cadastral info (Ada, Parsel, İl, İlçe, Mahalle) from text (KML XML or GeoJSON) and filename.
 */
export function extractCadastralInfo(fileText: string, fileName?: string): Partial<CadastralInfo> {
  const info: Partial<CadastralInfo> = {};

  // 1. Try Filename Patterns (e.g. "1042_18.kml", "1042-18", "ada1042_parsel18")
  if (fileName) {
    const cleanName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
    
    // Pattern: 1042_18 or 1042-18 or 1042/18
    const slashOrUnder = cleanName.match(/(\d+)[_/-](\d+)/);
    if (slashOrUnder) {
      info.adaNo = slashOrUnder[1];
      info.parselNo = slashOrUnder[2];
    } else {
      const adaMatch = cleanName.match(/ada[_\s-]*(\d+)/i);
      const parselMatch = cleanName.match(/parsel[_\s-]*(\d+)/i);
      if (adaMatch) info.adaNo = adaMatch[1];
      if (parselMatch) info.parselNo = parselMatch[1];
    }
  }

  // 2. Parse KML SimpleData in ExtendedData (Standard TKGM Megsis format)
  // Example: <SimpleData name="ADA">1042</SimpleData>
  const simpleDataRegex = /<SimpleData\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/SimpleData>/gi;
  let sdMatch: RegExpExecArray | null;
  while ((sdMatch = simpleDataRegex.exec(fileText)) !== null) {
    const fieldName = sdMatch[1].trim().toUpperCase();
    const val = sdMatch[2].trim();
    if (!val) continue;

    if ((fieldName === 'IL' || fieldName === 'İL') && !info.il) info.il = val;
    else if ((fieldName === 'ILCE' || fieldName === 'İLÇE') && !info.ilce) info.ilce = val;
    else if ((fieldName === 'MAHALLE' || fieldName === 'MAHALLE_ADI' || fieldName === 'KOY' || fieldName === 'KÖY') && !info.mahalle) info.mahalle = val;
    else if ((fieldName === 'ADA' || fieldName === 'ADANO' || fieldName === 'ADA_NO') && !info.adaNo) info.adaNo = val;
    else if ((fieldName === 'PARSEL' || fieldName === 'PARSELNO' || fieldName === 'PARSEL_NO') && !info.parselNo) info.parselNo = val;
    else if ((fieldName === 'MEVKII' || fieldName === 'MEVKİ') && !info.mevkii) info.mevkii = val;
    else if ((fieldName === 'NITELIK' || fieldName === 'NİTELİK' || fieldName === 'VASIF') && !info.nitelik) info.nitelik = val;
    else if ((fieldName === 'ALAN' || fieldName === 'TAPUALAN' || fieldName === 'TAPU_ALANI') && !info.tapuAlaniM2) {
      const parsedNum = parseFloat(val.replace(',', '.'));
      if (!isNaN(parsedNum)) info.tapuAlaniM2 = parsedNum;
    }
  }

  // 3. Check JSON properties if text is GeoJSON
  if (fileText.trim().startsWith('{')) {
    try {
      const json = JSON.parse(fileText);
      const props = json.properties || (json.features && json.features[0]?.properties) || {};
      for (const [k, v] of Object.entries(props)) {
        if (typeof v !== 'string' && typeof v !== 'number') continue;
        const key = k.trim().toUpperCase();
        const val = String(v).trim();
        if (!val) continue;

        if ((key === 'IL' || key === 'İL') && !info.il) info.il = val;
        else if ((key === 'ILCE' || key === 'İLÇE') && !info.ilce) info.ilce = val;
        else if ((key === 'MAHALLE' || key === 'MAHALLE_ADI') && !info.mahalle) info.mahalle = val;
        else if ((key === 'ADA' || key === 'ADANO' || key === 'ADA_NO') && !info.adaNo) info.adaNo = val;
        else if ((key === 'PARSEL' || key === 'PARSELNO' || key === 'PARSEL_NO') && !info.parselNo) info.parselNo = val;
        else if ((key === 'MEVKII' || key === 'MEVKİ') && !info.mevkii) info.mevkii = val;
        else if ((key === 'NITELIK' || key === 'NİTELİK' || key === 'VASIF') && !info.nitelik) info.nitelik = val;
      }
    } catch {}
  }

  // 4. Placemark <name> in KML
  const nameMatch = fileText.match(/<Placemark[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  if (nameMatch && nameMatch[1]) {
    const rawPlacemarkName = nameMatch[1].trim();
    // Pattern: 1042/18 or 1042 Ada 18 Parsel
    const pSlash = rawPlacemarkName.match(/(\d+)\s*[/_-]\s*(\d+)/);
    if (pSlash && (!info.adaNo || !info.parselNo)) {
      if (!info.adaNo) info.adaNo = pSlash[1];
      if (!info.parselNo) info.parselNo = pSlash[2];
    }
  }

  return info;
}

/**
 * Computes polygon centroid and derives location (İl, İlçe, Mahalle) based on coordinates.
 */
export async function deriveCadastralLocation(
  polygon: Feature<Polygon | MultiPolygon>,
  extractedInfo?: Partial<CadastralInfo>
): Promise<CadastralInfo> {
  const center = turf.centroid(polygon);
  const [lng, lat] = center.geometry.coordinates;

  const defaultLocation = getProvinceFromCoordinates(lng, lat);

  const finalInfo: CadastralInfo = {
    il: extractedInfo?.il || defaultLocation.il,
    ilce: extractedInfo?.ilce || defaultLocation.ilce,
    mahalle: extractedInfo?.mahalle || 'Merkez Mah.',
    adaNo: extractedInfo?.adaNo || '1042',
    parselNo: extractedInfo?.parselNo || '18',
    mevkii: extractedInfo?.mevkii || 'Köy İçi',
    nitelik: extractedInfo?.nitelik || 'Arsa / Tarla',
    source: extractedInfo?.adaNo ? 'file' : 'location'
  };

  // If online and missing detailed mahalle/ilce, attempt a fast reverse geocode query
  if (!extractedInfo?.mahalle || extractedInfo.mahalle === 'Merkez Mah.') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        if (addr.province || addr.state) finalInfo.il = addr.province || addr.state;
        if (addr.county || addr.town || addr.district) finalInfo.ilce = addr.county || addr.town || addr.district;
        if (addr.suburb || addr.neighbourhood || addr.village) {
          finalInfo.mahalle = addr.suburb || addr.neighbourhood || addr.village;
        }
      }
    } catch {
      // Fallback cleanly without blocking
    }
  }

  return finalInfo;
}
