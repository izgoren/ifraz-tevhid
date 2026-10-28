import { GeneratedParcel } from '../types';

/**
 * Generates valid KML file content with custom styles, parcel names, and areas.
 */
export function exportToKML(parcels: GeneratedParcel[], projectName = 'Tevhid_Ifraz_Projesi'): string {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${projectName}</name>
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
      <name>${p.name}</name>
      <description><![CDATA[
        <b>Ada/Parsel:</b> ${p.adaNo || '-'}/${p.parselNo || '-'}<br/>
        <b>Malik:</b> ${p.ownerName || '-'}<br/>
        <b>Alan:</b> ${p.areaM2.toFixed(2)} m²<br/>
        <b>Yol Cephesi:</b> ${p.frontageM} m<br/>
        <b>Derinlik:</b> ${p.depthM} m<br/>
        <b>Açıklama:</b> ${p.notes || '-'}<br/>
        <b>Durum:</b> ${p.isValid ? 'Mevzuata Uygun' : 'Kısıt İhlali (' + p.validationReasons.join(', ') + ')'}
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
 * Exports parcel corner point coordinates as CSV (Netcad / CAD NOP list format).
 */
export function exportToCSV(parcels: GeneratedParcel[]): string {
  let csv = 'Parsel_Adi,Ada_No,Parsel_No,Malik,Nokta_No,Boylam_X,Enlem_Y,Alan_m2,Notes\n';

  parcels.forEach((p) => {
    let coords: [number, number][] = [];
    if (p.feature.geometry.type === 'Polygon') {
      coords = p.feature.geometry.coordinates[0] as [number, number][];
    } else if (p.feature.geometry.type === 'MultiPolygon') {
      coords = p.feature.geometry.coordinates[0][0] as [number, number][];
    }

    coords.forEach((pt, idx) => {
      csv += `"${p.name}","${p.adaNo || ''}","${p.parselNo || ''}","${p.ownerName || ''}",P${idx + 1},${pt[0].toFixed(8)},${pt[1].toFixed(8)},${p.areaM2},"${p.notes || ''}"\n`;
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
