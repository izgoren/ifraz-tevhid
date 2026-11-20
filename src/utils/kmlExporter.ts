import { GeneratedParcel, LoadedCadastralParcel } from '../types';
import { toTurefTM3 } from './coordinateSystems';

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPolygonKmlFragment(rings: number[][][]): string {
  if (!rings || rings.length === 0) return '';
  const outerCoords = rings[0].map((c) => `${c[0]},${c[1]},0`).join(' ');
  let frag = `        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${outerCoords}</coordinates>
            </LinearRing>
          </outerBoundaryIs>`;
  for (let i = 1; i < rings.length; i++) {
    const innerCoords = rings[i].map((c) => `${c[0]},${c[1]},0`).join(' ');
    frag += `
          <innerBoundaryIs>
            <LinearRing>
              <coordinates>${innerCoords}</coordinates>
            </LinearRing>
          </innerBoundaryIs>`;
  }
  frag += `
        </Polygon>`;
  return frag;
}

/**
 * Generates valid KML file content for loaded cadastral parcels with all ExtendedData attributes.
 */
export function exportLoadedParcelsToKML(
  parcels: LoadedCadastralParcel[],
  documentName = 'Kadastro_Oznitelik_Verileri'
): string {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <description>Öznitelik Tablosundan Dışa Aktarılan Kadastro Parselleri ve Öznitelik Verileri</description>
    <Style id="cadastralParcelStyle">
      <LineStyle>
        <color>ff0284c7</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>6638bdf8</color>
      </PolyStyle>
    </Style>
`;

  parcels.forEach((p) => {
    const info = p.cadastralInfo;
    const placemarkName =
      info.adaNo || info.parselNo
        ? `${info.adaNo || '-'}/${info.parselNo || '-'}`
        : p.name || 'Parsel';

    let geometryXml = '';
    if (p.geometry.geometry.type === 'Polygon') {
      geometryXml = buildPolygonKmlFragment(p.geometry.geometry.coordinates as number[][][]);
    } else if (p.geometry.geometry.type === 'MultiPolygon') {
      const polys = p.geometry.geometry.coordinates as number[][][][];
      if (polys.length === 1) {
        geometryXml = buildPolygonKmlFragment(polys[0]);
      } else if (polys.length > 1) {
        geometryXml = `        <MultiGeometry>\n${polys
          .map((poly) => buildPolygonKmlFragment(poly))
          .join('\n')}\n        </MultiGeometry>`;
      }
    }

    const extendedEntries: Array<[string, string]> = [
      ['il', info.il || ''],
      ['ilce', info.ilce || ''],
      ['mahalle', info.mahalle || ''],
      ['adaNo', info.adaNo || ''],
      ['parselNo', info.parselNo || ''],
      ['mevkii', info.mevkii || ''],
      ['nitelik', info.nitelik || ''],
      ['alan_m2', p.areaM2.toFixed(2)],
      ['tapuAlani_m2', info.tapuAlaniM2 !== undefined ? info.tapuAlaniM2.toFixed(2) : ''],
      ['kaynakDosya', p.fileName || '']
    ];

    if (p.soilClassification) {
      extendedEntries.push(['zeminSinifi_TBDY', p.soilClassification.soilClass]);
      extendedEntries.push(['vs30_ms', String(p.soilClassification.vs30)]);
      extendedEntries.push(['tasimaGucu_kgcm2', String(p.soilClassification.bearingCapacityKgCm2)]);
    }
    if (p.topography) {
      extendedEntries.push(['egim_yuzde', String(p.topography.avgSlopePercent)]);
      extendedEntries.push(['kotFarki_m', String(p.topography.elevationDiffM)]);
    }

    const seenKeys = new Set(extendedEntries.map(([k]) => k.toLowerCase()));
    if (p.rawProperties) {
      Object.entries(p.rawProperties).forEach(([k, v]) => {
        if (!seenKeys.has(k.toLowerCase())) {
          seenKeys.add(k.toLowerCase());
          extendedEntries.push([k, v ?? '']);
        }
      });
    }

    const extendedDataXml = extendedEntries
      .filter(([, val]) => val !== '')
      .map(
        ([k, val]) =>
          `        <Data name="${escapeXml(k)}"><value>${escapeXml(val)}</value></Data>`
      )
      .join('\n');

    kml += `    <Placemark>
      <name>${escapeXml(placemarkName)}</name>
      <description><![CDATA[
        <b>İl / İlçe:</b> ${escapeXml(info.il || '-')} / ${escapeXml(info.ilce || '-')}<br/>
        <b>Mahalle:</b> ${escapeXml(info.mahalle || '-')}<br/>
        <b>Ada / Parsel:</b> ${escapeXml(info.adaNo || '-')} / ${escapeXml(info.parselNo || '-')}<br/>
        <b>Mevkii / Nitelik:</b> ${escapeXml(info.mevkii || '-')} / ${escapeXml(info.nitelik || '-')}<br/>
        <b>Hesaplanan Alan:</b> ${p.areaM2.toFixed(2)} m²<br/>
        <b>Tapu Alanı:</b> ${info.tapuAlaniM2 !== undefined ? info.tapuAlaniM2.toFixed(2) + ' m²' : '-'}<br/>
        <b>Dosya:</b> ${escapeXml(p.fileName || '-')}
      ]]></description>
      <styleUrl>#cadastralParcelStyle</styleUrl>
      <ExtendedData>
${extendedDataXml}
      </ExtendedData>
${geometryXml}
    </Placemark>
`;
  });

  kml += `  </Document>
</kml>`;

  return kml;
}

/**
 * Generates valid KML file content with custom styles, parcel names, and areas.
 */
export function exportToKML(parcels: GeneratedParcel[], projectName = 'Tevhid_Ifraz_Projesi'): string {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(projectName)}</name>
    <description>Tevhid ve İfraz Aracı Tarafından Oluşturulan Parsel Haritası</description>
    <Style id="validParcelStyle">
      <LineStyle>
        <color>ffc78402</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>7fc78402</color>
      </PolyStyle>
    </Style>
    <Style id="invalidParcelStyle">
      <LineStyle>
        <color>ff2626dc</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>7f2626dc</color>
      </PolyStyle>
    </Style>
`;

  parcels.forEach((p) => {
    let coordsText = '';
    if (p.feature.geometry.type === 'Polygon') {
      const coords = p.feature.geometry.coordinates[0];
      coordsText = coords.map((c) => `${c[0]},${c[1]},0`).join(' ');
    } else if (p.feature.geometry.type === 'MultiPolygon') {
      const coords = p.feature.geometry.coordinates[0][0];
      coordsText = coords.map((c) => `${c[0]},${c[1]},0`).join(' ');
    }

    const styleUrl = p.isValid ? '#validParcelStyle' : '#invalidParcelStyle';

    kml += `    <Placemark>
      <name>${escapeXml(p.name)}</name>
      <description><![CDATA[
        <b>Ada/Parsel:</b> ${escapeXml(p.adaNo || '-')}/${escapeXml(p.parselNo || '-')}<br/>
        <b>Malik:</b> ${escapeXml(p.ownerName || '-')}<br/>
        <b>Alan:</b> ${p.areaM2.toFixed(2)} m²<br/>
        <b>Yol Cephesi:</b> ${p.frontageM} m<br/>
        <b>Derinlik:</b> ${p.depthM} m<br/>
        <b>Açıklama:</b> ${escapeXml(p.notes || '-')}<br/>
        <b>Durum:</b> ${p.isValid ? 'Mevzuata Uygun' : 'Kısıt İhlali (' + escapeXml(p.validationReasons.join(', ')) + ')'}
      ]]></description>
      <styleUrl>${styleUrl}</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsText}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
`;
  });

  kml += `  </Document>
</kml>`;

  return kml;
}

/**
 * Exports parcels as standard GeoJSON feature collection.
 */
export function exportToGeoJSON(parcels: GeneratedParcel[]): string {
  const collection = {
    type: 'FeatureCollection',
    features: parcels.map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        name: p.name,
        adaNo: p.adaNo || '',
        parselNo: p.parselNo || '',
        ownerName: p.ownerName || '',
        notes: p.notes || '',
        areaM2: p.areaM2,
        frontageM: p.frontageM,
        depthM: p.depthM,
        isValid: p.isValid,
        reasons: p.validationReasons
      },
      geometry: p.feature.geometry
    }))
  };

  return JSON.stringify(collection, null, 2);
}

/**
 * Exports parcel corner point coordinates as CSV (Netcad / CAD NOP & TUREF format).
 */
export function exportToCSV(parcels: GeneratedParcel[]): string {
  let csv = 'Parsel_Adi,Ada_No,Parsel_No,Malik,Nokta_No,TUREF_Y_Saga_m,TUREF_X_Yukari_m,TUREF_DOM,TUREF_EPSG,Boylam_X,Enlem_Y,Alan_m2,Notes\n';

  parcels.forEach((p) => {
    let coords: [number, number][] = [];
    if (p.feature.geometry.type === 'Polygon') {
      coords = p.feature.geometry.coordinates[0] as [number, number][];
    } else if (p.feature.geometry.type === 'MultiPolygon') {
      coords = p.feature.geometry.coordinates[0][0] as [number, number][];
    }

    const uniqueCoords = coords.length > 1 ? coords.slice(0, -1) : coords;
    uniqueCoords.forEach((pt, idx) => {
      const turef = toTurefTM3(pt[0], pt[1]);
      csv += `"${p.name}","${p.adaNo || ''}","${p.parselNo || ''}","${p.ownerName || ''}",P${idx + 1},${turef.sagaY.toFixed(2)},${turef.yukariX.toFixed(2)},${turef.centralMeridian},${turef.epsg},${pt[0].toFixed(8)},${pt[1].toFixed(8)},${p.areaM2},"${p.notes || ''}"\n`;
    });
  });

  return csv;
}

/**
 * Triggers file download in browser.
 */
export function triggerFileDownload(content: string, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
