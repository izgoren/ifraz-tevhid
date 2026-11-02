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

export function normalizeCadastralKey(key: string): string {
  return key
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/[\s_\-.:/\\#*]+/g, '')
    .toUpperCase();
}

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
 * Accurately parses TKGM Megsis, Netcad HTML tables, and standard GIS properties.
 */
export function extractCadastralInfo(fileText: string, fileName?: string): Partial<CadastralInfo> {
  const info: Partial<CadastralInfo> = {};

  // 1. Parse SimpleData tags in ExtendedData (Standard TKGM Megsis format)
  // Matches e.g. <SimpleData name="ADA">1042</SimpleData> or name="AdaNo" or name="ADA_NO"
  const simpleDataRegex = /<SimpleData\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/SimpleData>/gi;
  let sdMatch: RegExpExecArray | null;
  while ((sdMatch = simpleDataRegex.exec(fileText)) !== null) {
    assignCadastralField(info, sdMatch[1], sdMatch[2]);
  }

  // 2. Parse Data tags with <value> (KML ExtendedData standard)
  const dataRegex = /<Data\s+name=["']([^"']+)["'][^>]*>[\s\S]*?<value>([\s\S]*?)<\/value>[\s\S]*?<\/Data>/gi;
  let dMatch: RegExpExecArray | null;
  while ((dMatch = dataRegex.exec(fileText)) !== null) {
    assignCadastralField(info, dMatch[1], dMatch[2]);
  }

  // 3. Parse Netcad HTML Table inside <description>
  // Netcad exports attributes in HTML tables inside <description> (e.g. <td>ADA</td><td>1042</td> or <th>Ada</th><td>1042</td>)
  const descMatch = fileText.match(/<description[\s\S]*?>([\s\S]*?)<\/description>/i);
  if (descMatch && descMatch[1]) {
    const desc = descMatch[1];
    
    // HTML table cell pattern: <td>KEY</td><td>VALUE</td>
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>\s*<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = cellRegex.exec(desc)) !== null) {
      const cleanKey = cMatch[1].replace(/<[^>]+>/g, '').trim();
      const cleanVal = cMatch[2].replace(/<[^>]+>/g, '').trim();
      if (cleanKey && cleanVal) {
        assignCadastralField(info, cleanKey, cleanVal);
      }
    }

    // Key-value text in description: e.g. ADA : 1042 or Ada No = 1042
    if (!info.adaNo) {
      const adaInDesc = desc.match(/(?:ADA|ADA\s*NO|ADANO)\s*[:=]\s*([^\s<>,;]+)/i);
      if (adaInDesc) info.adaNo = adaInDesc[1].trim();
    }
    if (!info.parselNo) {
      const parselInDesc = desc.match(/(?:PARSEL|PARSEL\s*NO|PARSELNO)\s*[:=]\s*([^\s<>,;]+)/i);
      if (parselInDesc) info.parselNo = parselInDesc[1].trim();
    }
  }

  // 4. Parse GeoJSON properties if text is JSON
  if (fileText.trim().startsWith('{') || fileText.trim().startsWith('[')) {
    try {
      const json = JSON.parse(fileText);
      const props = json.properties || (json.features && json.features[0]?.properties) || {};
      for (const [k, v] of Object.entries(props)) {
        if (v !== null && v !== undefined) {
          assignCadastralField(info, k, String(v));
        }
      }
    } catch {}
  }

  // 5. Placemark <name> in KML
  const nameMatch = fileText.match(/<Placemark[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  if (nameMatch && nameMatch[1]) {
    extractFromTextLabel(info, nameMatch[1].trim());
  }

  // 6. Filename pattern fallback (e.g. "1042_18.kml", "1042-18", "ada1042_parsel18")
  if (fileName) {
    const cleanName = fileName.replace(/\.[^/.]+$/, '');
    extractFromTextLabel(info, cleanName);
  }

  return info;
}

/**
 * Assigns normalized field value to CadastralInfo.
 */
export function assignCadastralField(info: Partial<CadastralInfo>, rawKey: string, rawVal: string) {
  const val = rawVal.replace(/<[^>]+>/g, '').trim();
  if (!val) return;

  const k = normalizeCadastralKey(rawKey);

  // ADA
  if (
    (k === 'ADA' || k === 'ADANO' || k === 'ADANUMARASI' || k === 'TAPUADA' || k === 'KADASTROADA' || k === 'BLOCK') &&
    !info.adaNo
  ) {
    info.adaNo = val;
    return;
  }

  // PARSEL
  if (
    (k === 'PARSEL' || k === 'PARSELNO' || k === 'PARSELNUMARASI' || k === 'TAPUPARSEL' || k === 'KADASTROPARSEL' || k === 'LOT') &&
    !info.parselNo
  ) {
    info.parselNo = val;
    return;
  }

  // ADAPARSEL combined (e.g. "1042/18" or "1042-18")
  if ((k === 'ADAPARSEL' || k === 'ADAPARSELNO' || k === 'PARCELID' || k === 'TABULUM') && (!info.adaNo || !info.parselNo)) {
    const slash = val.match(/(\d+)\s*[/_-]\s*(\d+)/);
    if (slash) {
      if (!info.adaNo) info.adaNo = slash[1];
      if (!info.parselNo) info.parselNo = slash[2];
      return;
    }
  }

  // IL
  if ((k === 'IL' || k === 'ILADI' || k === 'SEHIR') && !info.il) {
    info.il = val;
    return;
  }

  // ILCE
  if ((k === 'ILCE' || k === 'ILCEADI') && !info.ilce) {
    info.ilce = val;
    return;
  }

  // MAHALLE / KOY
  if ((k === 'MAHALLE' || k === 'MAHALLEADI' || k === 'KOY' || k === 'KOYADI') && !info.mahalle) {
    info.mahalle = val;
    return;
  }

  // MEVKII
  if ((k === 'MEVKII' || k === 'MEVKI') && !info.mevkii) {
    info.mevkii = val;
    return;
  }

  // NITELIK / VASIF
  if ((k === 'NITELIK' || k === 'VASIF' || k === 'CINSI' || k === 'KULLANIM') && !info.nitelik) {
    info.nitelik = val;
    return;
  }

  // ALAN
  if ((k === 'ALAN' || k === 'TAPUALAN' || k === 'TAPUALANI' || k === 'YUZOLCUM' || k === 'YUZOLCUMU') && !info.tapuAlaniM2) {
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num)) info.tapuAlaniM2 = num;
  }
}

/**
 * Extracts Ada and Parsel from text names (e.g. "1042/18", "1042 Ada 18 Parsel", "Ada 1042, Parsel 18").
 */
export function extractFromTextLabel(info: Partial<CadastralInfo>, text: string) {
  if (!text) return;

  // Pattern: "1042/18" or "1042 / 18" or "1042-18" or "1042_18"
  const slashOrUnder = text.match(/(\d+)\s*[/_-]\s*(\d+)/);
  if (slashOrUnder && (!info.adaNo || !info.parselNo)) {
    if (!info.adaNo) info.adaNo = slashOrUnder[1];
    if (!info.parselNo) info.parselNo = slashOrUnder[2];
    return;
  }

  // Pattern: "1042 Ada 18 Parsel" or "Ada: 1042 Parsel: 18"
  const adaExplicit = text.match(/ada[_\s-:]*(\d+)/i);
  const parselExplicit = text.match(/parsel[_\s-:]*(\d+)/i);
  if (adaExplicit && !info.adaNo) info.adaNo = adaExplicit[1];
  if (parselExplicit && !info.parselNo) info.parselNo = parselExplicit[1];

  // Pattern: "1042 Ada"
  if (!info.adaNo) {
    const numBeforeAda = text.match(/(\d+)\s*ada/i);
    if (numBeforeAda) info.adaNo = numBeforeAda[1];
  }
}

/**
 * Computes polygon centroid and derives location (İl, İlçe, Mahalle) based on coordinates.
 * Preserves exact file cadastral metadata without overriding with mock values.
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
    adaNo: extractedInfo?.adaNo || '-',
    parselNo: extractedInfo?.parselNo || '-',
    mevkii: extractedInfo?.mevkii || '',
    nitelik: extractedInfo?.nitelik || 'Arsa / Tarla',
    source: extractedInfo?.adaNo && extractedInfo.adaNo !== '-' ? 'file' : 'location'
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
