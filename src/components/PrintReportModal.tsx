import React, { useState, useMemo, useRef } from 'react';
import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import { GeneratedParcel, ParcelGeometry, SubdivisionConfig } from '../types';
import {
  Printer,
  X,
  Edit3,
  ChevronDown,
  ChevronUp,
  Maximize2,
  ZoomIn,
  ZoomOut,
  FileDown,
  Ruler,
  Crosshair,
  Settings2
} from 'lucide-react';
import { CadastralInfo } from '../utils/cadastralLocation';
import {
  CoordinateSystemId,
  formatCoordinateInSystem,
  getAutoTurefDom,
  getCoordinateSystemDisplayName,
  getTurefTm3Epsg,
  getUtmZoneInfo,
  TURKEY_TM3_DOMS
} from '../utils/coordinateSystems';
import { lngLatToLocalXY } from '../utils/dynamicSnap';
import {
  generateAndDownloadPdf,
  PageMarginPreset,
  PageOrientation,
  PaperSize
} from '../utils/pdfGenerator';

interface PrintReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  mainPolygon: ParcelGeometry | null;
  parcels: GeneratedParcel[];
  roadLines: Feature<LineString>[];
  config?: SubdivisionConfig;
  cadastralInfo?: CadastralInfo;
  onUpdateCadastralInfo?: (info: CadastralInfo) => void;
}

interface UniquePointRecord {
  pointNo: number;
  label: string;
  lng: number;
  lat: number;
  px: number;
  py: number;
  parcelNames: string[];
}

type ScalePreset = 'fit' | 200 | 500 | 1000 | 2000 | 5000;

const PAPER_WIDTH_MM: Record<PaperSize, Record<PageOrientation, number>> = {
  A4: { portrait: 210, landscape: 297 },
  A3: { portrait: 297, landscape: 420 }
};

const MARGIN_MM_MAP: Record<PageMarginPreset, number> = {
  narrow: 6,
  normal: 10,
  wide: 15
};

export const PrintReportModal: React.FC<PrintReportModalProps> = ({
  isOpen,
  onClose,
  mainPolygon,
  parcels,
  roadLines,
  cadastralInfo,
  onUpdateCadastralInfo
}) => {
  const [il, setIl] = useState(cadastralInfo?.il || 'Ankara');
  const [ilce, setIlce] = useState(cadastralInfo?.ilce || 'Gölbaşı');
  const [mahalle, setMahalle] = useState(cadastralInfo?.mahalle || 'Merkez Mah.');
  const [adaNo, setAdaNo] = useState(cadastralInfo?.adaNo || '1042');
  const [parselNo, setParselNo] = useState(cadastralInfo?.parselNo || '18');
  const [mevkii, setMevkii] = useState(cadastralInfo?.mevkii || 'Köy İçi');
  const [nitelik, setNitelik] = useState(cadastralInfo?.nitelik || 'Arsa / Tarla');
  const [showEditDrawer, setShowEditDrawer] = useState(false);

  // TUREF / Coordinate System
  const [coordSystem, setCoordSystem] = useState<CoordinateSystemId>('TUREF_TM3');
  const [selectedDom, setSelectedDom] = useState<number | 'auto'>('auto');

  // Content Toggles (Aç / Kapat)
  const [showFrontages, setShowFrontages] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(true);

  // Kroki Scale & Fit Controls
  const [scalePreset, setScalePreset] = useState<ScalePreset>('fit');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);

  // Printer & PDF Settings
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<PageOrientation>('portrait');
  const [marginPreset, setMarginPreset] = useState<PageMarginPreset>('normal');
  const [showPrintSettingsDrawer, setShowPrintSettingsDrawer] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    if (cadastralInfo) {
      if (cadastralInfo.il) setIl(cadastralInfo.il);
      if (cadastralInfo.ilce) setIlce(cadastralInfo.ilce);
      if (cadastralInfo.mahalle) setMahalle(cadastralInfo.mahalle);
      if (cadastralInfo.adaNo) setAdaNo(cadastralInfo.adaNo);
      if (cadastralInfo.parselNo) setParselNo(cadastralInfo.parselNo);
      if (cadastralInfo.mevkii) setMevkii(cadastralInfo.mevkii);
      if (cadastralInfo.nitelik) setNitelik(cadastralInfo.nitelik);
    }
  }, [cadastralInfo]);

  const currentDate = useMemo(() => {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date());
  }, []);

  const totalAreaM2 = useMemo(() => {
    if (parcels.length > 0) {
      return parcels.reduce((sum, p) => sum + p.areaM2, 0);
    }
    if (mainPolygon) {
      try {
        return turf.area(mainPolygon);
      } catch {
        return 0;
      }
    }
    return 0;
  }, [parcels, mainPolygon]);

  const extractRingCoords = (geom: ParcelGeometry): [number, number][] => {
    if (geom.geometry.type === 'Polygon') {
      return (geom.geometry.coordinates[0] || []) as [number, number][];
    }
    if (geom.geometry.type === 'MultiPolygon') {
      return (geom.geometry.coordinates[0]?.[0] || []) as [number, number][];
    }
    return [];
  };

  const marginMm = MARGIN_MM_MAP[marginPreset];
  const printableWidthMm = PAPER_WIDTH_MM[paperSize][orientation] - marginMm * 2;

  // Compute metric SVG geometry, scale bar, corner points (P1, P2...) and parcel summaries
  const reportData = useMemo(() => {
    if (!mainPolygon && parcels.length === 0) return null;

    try {
      const allFeatures: any[] = [];
      if (mainPolygon) allFeatures.push(mainPolygon);
      parcels.forEach((p) => allFeatures.push(p.feature));
      roadLines.forEach((rl) => allFeatures.push(rl));

      const fc = turf.featureCollection(allFeatures);
      const bbox = turf.bbox(fc);

      const centerLng = (bbox[0] + bbox[2]) / 2;
      const centerLat = (bbox[1] + bbox[3]) / 2;
      const origin: [number, number] = [centerLng, centerLat];

      const [minX_m, minY_m] = lngLatToLocalXY([bbox[0], bbox[1]], origin);
      const [maxX_m, maxY_m] = lngLatToLocalXY([bbox[2], bbox[3]], origin);

      const spanXM = Math.max(5, maxX_m - minX_m);
      const spanYM = Math.max(5, maxY_m - minY_m);

      const width = 800;
      const height = 460;
      const padding = 48;

      const fitPxPerM = Math.min((width - padding * 2) / spanXM, (height - padding * 2) / spanYM);

      let pxPerM: number;
      if (scalePreset === 'fit') {
        pxPerM = fitPxPerM * (zoomPercent / 100);
      } else {
        // Real paper scale: 1m on paper = (1000 / denom) mm -> convert mm to SVG units
        pxPerM = (1000 / scalePreset) * (width / printableWidthMm) * (zoomPercent / 100);
      }

      const effectiveScaleDenom = Math.max(
        50,
        Math.round(1000 / (pxPerM * (printableWidthMm / width)))
      );

      // Dynamic clean round scale bar length in meters (e.g., 5m, 10m, 20m, 50m, 100m, 200m)
      const targetBarPx = 110;
      const rawBarM = targetBarPx / pxPerM;
      const niceSteps = [2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
      const scaleBarMeters =
        niceSteps.find((s) => s >= rawBarM * 0.7) ?? Math.max(10, Math.round(rawBarM));
      const scaleBarPx = scaleBarMeters * pxPerM;

      const project = (lng: number, lat: number): [number, number] => {
        const [xm, ym] = lngLatToLocalXY([lng, lat], origin);
        const x = width / 2 + panOffset.x + xm * pxPerM;
        const y = height / 2 + panOffset.y - ym * pxPerM;
        return [x, y];
      };

      const uniquePoints: UniquePointRecord[] = [];
      const registerPoint = (lng: number, lat: number, parcelLabel: string): number => {
        const tol = 1e-6;
        const existing = uniquePoints.find(
          (pt) => Math.abs(pt.lng - lng) < tol && Math.abs(pt.lat - lat) < tol
        );
        if (existing) {
          if (!existing.parcelNames.includes(parcelLabel)) {
            existing.parcelNames.push(parcelLabel);
          }
          return existing.pointNo;
        }
        const pointNo = uniquePoints.length + 1;
        const [px, py] = project(lng, lat);
        uniquePoints.push({
          pointNo,
          label: `P${pointNo}`,
          lng,
          lat,
          px,
          py,
          parcelNames: [parcelLabel]
        });
        return pointNo;
      };

      let mainPath = '';
      if (mainPolygon) {
        const coords = extractRingCoords(mainPolygon);
        if (coords.length > 0) {
          mainPath =
            coords
              .map((c, i) => {
                const [px, py] = project(c[0], c[1]);
                return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
              })
              .join(' ') + ' Z';
        }
      }

      const targetParcels: Array<{
        id: string;
        name: string;
        feature: ParcelGeometry;
        areaM2: number;
        frontageM: number;
        rearWidthM?: number;
        depthM: number;
        isValid: boolean;
      }> =
        parcels.length > 0
          ? parcels
          : mainPolygon
          ? [
              {
                id: 'root-parcel',
                name: `Kök Parsel (${adaNo}/${parselNo})`,
                feature: mainPolygon,
                areaM2: turf.area(mainPolygon),
                frontageM: 0,
                rearWidthM: 0,
                depthM: 0,
                isValid: true
              }
            ]
          : [];

      const parcelItems = targetParcels.map((p, pIdx) => {
        const coords = extractRingCoords(p.feature);
        const pathD =
          coords
            .map((c, i) => {
              const [px, py] = project(c[0], c[1]);
              return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
            })
            .join(' ') + ' Z';

        const center = turf.centerOfMass(p.feature);
        const [cx, cy] = project(center.geometry.coordinates[0], center.geometry.coordinates[1]);

        const ringPoints = coords.length > 1 ? coords.slice(0, -1) : coords;
        const parcelLabel = parcels.length > 0 ? p.name : 'Ana Parsel';
        const vertexNos = ringPoints.map((c) => registerPoint(c[0], c[1], parcelLabel));

        const edges: {
          fromLabel: string;
          toLabel: string;
          x1: number;
          y1: number;
          x2: number;
          y2: number;
          midX: number;
          midY: number;
          len: number;
          angle: number;
        }[] = [];

        for (let i = 0; i < ringPoints.length; i++) {
          const nextIdx = (i + 1) % ringPoints.length;
          const c1 = ringPoints[i];
          const c2 = ringPoints[nextIdx];
          const [x1, y1] = project(c1[0], c1[1]);
          const [x2, y2] = project(c2[0], c2[1]);
          const len = turf.distance(turf.point(c1), turf.point(c2), { units: 'meters' });
          if (!Number.isFinite(len) || len < 0.25) continue;

          let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
          if (!Number.isFinite(angle)) {
            angle = 0;
          } else {
            angle = ((((angle + 90) % 180) + 180) % 180) - 90;
          }

          edges.push({
            fromLabel: `P${vertexNos[i]}`,
            toLabel: `P${vertexNos[nextIdx]}`,
            x1,
            y1,
            x2,
            y2,
            midX: (x1 + x2) / 2,
            midY: (y1 + y2) / 2,
            len: Math.round(len * 100) / 100,
            angle
          });
        }

        return {
          id: p.id,
          name: p.name,
          index: pIdx + 1,
          pathD,
          cx,
          cy,
          area: p.areaM2,
          frontage: p.frontageM,
          rearWidth: p.rearWidthM ?? 0,
          depth: p.depthM,
          isValid: p.isValid,
          edges
        };
      });

      const roadPaths = roadLines.map((rl) => {
        const coords = rl.geometry.coordinates;
        return coords
          .map((c, i) => {
            const [px, py] = project(c[0], c[1]);
            return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
          })
          .join(' ');
      });

      const autoDom = getAutoTurefDom(centerLng);
      const utmInfo = getUtmZoneInfo(centerLng);

      return {
        width,
        height,
        mainPath,
        parcelItems,
        roadPaths,
        uniquePoints,
        autoDom,
        utmInfo,
        effectiveScaleDenom,
        scaleBarMeters,
        scaleBarPx
      };
    } catch (err) {
      console.warn('Report build error:', err);
      return null;
    }
  }, [
    mainPolygon,
    parcels,
    roadLines,
    adaNo,
    parselNo,
    scalePreset,
    zoomPercent,
    panOffset,
    printableWidthMm
  ]);

  if (!isOpen) return null;

  const activeDom = selectedDom === 'auto' ? (reportData?.autoDom ?? 33) : selectedDom;
  const systemSummaryText =
    coordSystem === 'TUREF_TM3'
      ? `TUREF TM${activeDom} (DOM ${activeDom}° · ${getTurefTm3Epsg(activeDom)})`
      : coordSystem === 'TUREF_UTM6'
      ? `TUREF UTM 6° (Dilim ${reportData?.utmInfo.zone ?? 36}N · ${reportData?.utmInfo.epsg ?? 'EPSG:5261'})`
      : 'WGS84 Coğrafi (EPSG:4326)';

  const coordColX =
    coordSystem === 'WGS84' ? 'Boylam (λ)' : coordSystem === 'TUREF_UTM6' ? 'Sağa (E) [m]' : 'Sağa (Y) [m]';
  const coordColY =
    coordSystem === 'WGS84' ? 'Enlem (φ)' : coordSystem === 'TUREF_UTM6' ? 'Yukarı (N) [m]' : 'Yukarı (X) [m]';

  const scaleLabel = reportData
    ? scalePreset === 'fit'
      ? `Ölçek ≈ 1/${reportData.effectiveScaleDenom} (Sığdır)`
      : `Ölçek: 1/${scalePreset}${zoomPercent !== 100 ? ` (%${zoomPercent})` : ''}`
    : 'Ölçek: —';

  const handleFitReset = () => {
    setScalePreset('fit');
    setZoomPercent(100);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleDownloadPdf = async () => {
    if (!reportData || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const subtitleText = `${il} / ${ilce} · ${mahalle}${mevkii ? ` · ${mevkii}` : ''} · Ada ${adaNo} / Parsel ${parselNo} · ${nitelik}`;
      const summaryRight = `${parcels.length > 0 ? `${parcels.length} İfraz Parseli` : 'Kök Parsel'} · ${totalAreaM2.toFixed(2)} m² · ${currentDate}`;

      await generateAndDownloadPdf({
        paperSize,
        orientation,
        marginPreset,
        title: 'İfraz ve Tevhid Uygulama Krokisi',
        subtitle: subtitleText,
        systemSummary: systemSummaryText,
        summaryRight,
        svgElement: svgRef.current,
        scaleLabel,
        showFrontages,
        showCoordinates,
        parcelRows: reportData.parcelItems.map((pi) => ({
          name: parcels.length > 0 ? `${pi.index}. ${pi.name}` : pi.name,
          area: pi.area.toFixed(2),
          frontage: pi.frontage > 0 ? `${pi.frontage.toFixed(2)} m` : '—',
          rearWidth: pi.rearWidth > 0 ? `${pi.rearWidth.toFixed(2)} m` : '—',
          depth: pi.depth > 0 ? `${pi.depth.toFixed(2)} m` : '—',
          edgesText: pi.edges.map((e) => `${e.fromLabel}–${e.toLabel}: ${e.len.toFixed(2)}m`).join(' · '),
          statusText: pi.isValid ? 'Uygun' : 'Kontrol',
          isValid: pi.isValid
        })),
        coordHeaders: {
          xLabel: coordColX,
          yLabel: coordColY
        },
        coordRows: reportData.uniquePoints.map((pt) => {
          const fmt = formatCoordinateInSystem(
            pt.lng,
            pt.lat,
            coordSystem,
            coordSystem === 'TUREF_TM3' ? activeDom : undefined
          );
          return {
            label: pt.label,
            xVal: fmt.xFormatted,
            yVal: fmt.yFormatted,
            zoneLabel: fmt.zoneLabel,
            parcelsText: pt.parcelNames.join(', ')
          };
        }),
        footerLeft: 'İzgören Harita Mühendislik',
        footerRight: `${paperSize} ${orientation === 'portrait' ? 'Dikey' : 'Yatay'} · ${currentDate}`,
        filename: `Ifraz_Krokisi_Ada${adaNo}_Parsel${parselNo}.pdf`
      });
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const sheetWidthClass =
    paperSize === 'A3'
      ? orientation === 'landscape'
        ? 'max-w-[420mm]'
        : 'max-w-[297mm]'
      : orientation === 'landscape'
      ? 'max-w-[297mm]'
      : 'max-w-[210mm]';

  let nextSectionNumber = 1;

  return (
    <div className="print-modal-backdrop fixed inset-0 z-[2000] bg-slate-950/85 backdrop-blur-xl overflow-y-auto flex flex-col items-center p-3 md:p-6 animate-in fade-in duration-150">
      {/* Dinamik Sayfa Boyutu / Yön / Kenar Boşluğu Kuralı (Yazıcı & Tarayıcı PDF İletişim Kutusu İçin) */}
      <style>{`@media print { @page { size: ${paperSize} ${orientation}; margin: ${marginMm}mm; } }`}</style>

      {/* Üst Kontrol Çubuğu (Yazdırmada Gizlenir) */}
      <div className={`no-print w-full ${sheetWidthClass} apple-glass rounded-2xl p-3 shadow-2xl mb-3 text-white space-y-2.5`}>
        {/* Satır 1: Koordinat Sistemi, Sayfa Ayarları ve Yazdırma / PDF İndir */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-white">Hızlı Yazdır</div>
            <span className="text-slate-500">·</span>

            {/* Koordinat Sistemi Seçici */}
            <div className="flex items-center gap-0.5 bg-white/[0.06] p-0.5 rounded-lg border border-white/10">
              {(['TUREF_TM3', 'TUREF_UTM6', 'WGS84'] as CoordinateSystemId[]).map((sys) => (
                <button
                  key={sys}
                  type="button"
                  onClick={() => setCoordSystem(sys)}
                  className={`px-2 py-1 rounded-md text-[10.5px] font-medium transition whitespace-nowrap ${
                    coordSystem === sys
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {getCoordinateSystemDisplayName(sys)}
                </button>
              ))}
            </div>

            {coordSystem === 'TUREF_TM3' && (
              <select
                value={selectedDom}
                onChange={(e) => setSelectedDom(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
                className="bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-[10.5px] text-slate-200 focus:outline-none focus:border-blue-400"
                title="TUREF Dilim Orta Meridyeni (DOM)"
              >
                <option value="auto">DOM: Oto ({reportData?.autoDom ?? 33}°)</option>
                {TURKEY_TM3_DOMS.map((dom) => (
                  <option key={dom} value={dom}>
                    DOM {dom}° (TM{dom})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowEditDrawer((prev) => !prev);
                setShowPrintSettingsDrawer(false);
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] transition whitespace-nowrap ${
                showEditDrawer
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-white/10 hover:bg-white/15 text-slate-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Ada / Parsel</span>
              {showEditDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPrintSettingsDrawer((prev) => !prev);
                setShowEditDrawer(false);
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] transition whitespace-nowrap ${
                showPrintSettingsDrawer
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'bg-white/10 hover:bg-white/15 text-slate-200'
              }`}
              title="Kağıt boyutu, dikey/yatay yön ve kenar boşluğu ayarları"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Sayfa ({paperSize} {orientation === 'portrait' ? 'Dikey' : 'Yatay'})</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf || !reportData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 text-slate-950 font-semibold rounded-xl text-[11px] transition whitespace-nowrap"
              title="Doğrudan çok sayfalı PDF dosyası olarak indir"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-medium rounded-xl text-[11px] transition whitespace-nowrap"
              title="Sistem yazıcı seçimi veya tarayıcı PDF penceresini aç"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazıcı Seç / Yazdır</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Satır 2: İfraz Cepheleri / Köşe Koordinatları Aç-Kapat & Kroki Ölçekle / Sığdır */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.08] text-[11px]">
          {/* İçerik Aç/Kapat Butonları */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowFrontages((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition font-medium ${
                showFrontages
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
              title="Kroki üzerindeki kenar ölçülerini ve İfraz Parselleri ve Cepheleri tablosunu aç/kapat"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>İfraz Cepheleri</span>
              <span className="text-[9.5px] font-mono font-bold px-1 rounded bg-black/30">
                {showFrontages ? 'AÇIK' : 'KAPALI'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowCoordinates((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition font-medium ${
                showCoordinates
                  ? 'bg-blue-500/20 text-blue-300 border-blue-400/40'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
              title="Kroki üzerindeki P1, P2 köşe noktalarını ve Köşe Koordinat Listesi tablosunu aç/kapat"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Köşe Koordinatları</span>
              <span className="text-[9.5px] font-mono font-bold px-1 rounded bg-black/30">
                {showCoordinates ? 'AÇIK' : 'KAPALI'}
              </span>
            </button>
          </div>

          {/* Krokiyi Ölçekle ve Sığdır */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Kroki Ölçeği:</span>
            <select
              value={scalePreset}
              onChange={(e) => {
                const val = e.target.value;
                setScalePreset(val === 'fit' ? 'fit' : (Number(val) as ScalePreset));
                if (val === 'fit') {
                  setZoomPercent(100);
                  setPanOffset({ x: 0, y: 0 });
                }
              }}
              className="bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-[10.5px] font-mono text-slate-100 focus:outline-none focus:border-blue-400"
              title="Kroki ölçeğini seçin"
            >
              <option value="fit">Otomatik Sığdır</option>
              <option value="200">1 / 200</option>
              <option value="500">1 / 500</option>
              <option value="1000">1 / 1000</option>
              <option value="2000">1 / 2000</option>
              <option value="5000">1 / 5000</option>
            </select>

            <div className="flex items-center gap-1 bg-white/[0.05] border border-white/10 rounded-lg px-1 py-0.5">
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.max(40, z - 10))}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/15 text-slate-200 transition"
                title="Krokiyi küçült (-%10)"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="font-mono text-[10.5px] font-bold text-amber-300 min-w-[38px] text-center">
                %{zoomPercent}
              </span>
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.min(250, z + 10))}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/15 text-slate-200 transition"
                title="Krokiyi büyüt (+%10)"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleFitReset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
              title="Krokiyi kağıda tam sığdır ve kaydırmayı sıfırla"
            >
              <Maximize2 className="w-3 h-3 text-cyan-400" />
              <span>Sığdır</span>
            </button>
          </div>
        </div>
      </div>

      {/* Yazıcı / Sayfa Ayarları Çekmecesi (Yazdırmada Gizlenir) */}
      {showPrintSettingsDrawer && (
        <div className={`no-print w-full ${sheetWidthClass} apple-glass rounded-2xl p-3.5 shadow-xl mb-3 text-white border border-white/10 text-xs space-y-2.5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Kağıt:</span>
              {(['A4', 'A3'] as PaperSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setPaperSize(sz)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold border transition ${
                    paperSize === sz
                      ? 'bg-blue-500 text-white border-blue-400'
                      : 'bg-white/[0.05] text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Yön:</span>
              {(
                [
                  { id: 'portrait', label: 'Dikey' },
                  { id: 'landscape', label: 'Yatay' }
                ] as const
              ).map((ori) => (
                <button
                  key={ori.id}
                  type="button"
                  onClick={() => setOrientation(ori.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                    orientation === ori.id
                      ? 'bg-blue-500 text-white border-blue-400'
                      : 'bg-white/[0.05] text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {ori.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Kenar Boşluğu:</span>
              {(
                [
                  { id: 'narrow', label: 'Dar (6mm)' },
                  { id: 'normal', label: 'Normal (10mm)' },
                  { id: 'wide', label: 'Geniş (15mm)' }
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMarginPreset(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                    marginPreset === m.id
                      ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400'
                      : 'bg-white/[0.05] text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[10.5px] text-slate-400 border-t border-white/[0.08] pt-2">
            İpucu: <strong className="text-slate-200">Yazıcı Seç / Yazdır</strong> butonuna bastığınızda açılan sistem penceresinde fiziksel yazıcınızı seçebilir veya <strong className="text-slate-200">PDF olarak kaydet</strong> diyebilirsiniz; <strong className="text-emerald-300">PDF İndir</strong> ise belgeyi tek tıkla doğrudan cihazınıza indirir.
          </div>
        </div>
      )}

      {/* Ada / Parsel Düzenleme Çekmecesi (Yazdırmada Gizlenir) */}
      {showEditDrawer && (
        <div className={`no-print w-full ${sheetWidthClass} apple-glass rounded-2xl p-3.5 shadow-xl mb-3 text-white border border-white/10`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs">
            {[
              { label: 'İl', val: il, setter: setIl, key: 'il' },
              { label: 'İlçe', val: ilce, setter: setIlce, key: 'ilce' },
              { label: 'Mahalle', val: mahalle, setter: setMahalle, key: 'mahalle' },
              { label: 'Ada No', val: adaNo, setter: setAdaNo, key: 'adaNo' },
              { label: 'Parsel No', val: parselNo, setter: setParselNo, key: 'parselNo' },
              { label: 'Mevkii', val: mevkii, setter: setMevkii, key: 'mevkii' },
              { label: 'Nitelik', val: nitelik, setter: setNitelik, key: 'nitelik' }
            ].map((field) => (
              <div key={field.key}>
                <label className="text-[10px] text-slate-400 block mb-1">{field.label}</label>
                <input
                  type="text"
                  value={field.val}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    field.setter(nextVal);
                    const nextInfo: CadastralInfo = {
                      il,
                      ilce,
                      mahalle,
                      adaNo,
                      parselNo,
                      mevkii,
                      nitelik,
                      [field.key]: nextVal
                    };
                    onUpdateCadastralInfo?.(nextInfo);
                  }}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sade A4/A3 Yazdırma Sayfası */}
      <div
        className={`w-full ${sheetWidthClass} bg-white text-slate-900 shadow-2xl p-6 sm:p-8 border border-slate-300 font-sans print:border-none print:shadow-none print:p-0 print:m-0 print:w-full print:max-w-none space-y-5`}
      >
        {/* Sade Başlık & Kadastro Özeti */}
        <header className="border-b border-slate-900 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              İfraz ve Tevhid Uygulama Krokisi
            </h1>
            <div className="text-[11px] text-slate-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-slate-900">
                {il} / {ilce}
              </span>
              <span>·</span>
              <span>{mahalle}</span>
              {mevkii && (
                <>
                  <span>·</span>
                  <span>{mevkii}</span>
                </>
              )}
              <span>·</span>
              <span className="font-mono tabular-nums">
                Ada {adaNo} / Parsel {parselNo}
              </span>
              <span>·</span>
              <span>{nitelik}</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 sm:text-right font-mono tabular-nums space-y-0.5 shrink-0">
            <div className="font-semibold text-slate-900">{systemSummaryText}</div>
            <div>
              {parcels.length > 0 ? `${parcels.length} İfraz Parseli` : 'Kök Parsel'} ·{' '}
              {totalAreaM2.toFixed(2)} m² · {currentDate}
            </div>
          </div>
        </header>

        {/* Ölçekli Uygulama Krokisi (SVG - Sürükleyerek Konumlandırılabilir) */}
        <section className="border border-slate-300 bg-white break-inside-avoid">
          <div className="px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-slate-900">Uygulama Krokisi</span>
              <span className="font-mono text-[10px] text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                {scaleLabel}
              </span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[10px]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 border-t-2 border-dashed border-slate-900 inline-block" />
                Kök Sınır
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 border-t-2 border-amber-600 inline-block" />
                Yol Sınırı
              </span>
              <span>Kuzey ↑</span>
            </div>
          </div>

          <div
            className="relative w-full bg-white flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none"
            style={{ aspectRatio: '800 / 460' }}
            onPointerDown={(e) => {
              dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                origX: panOffset.x,
                origY: panOffset.y
              };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragStartRef.current) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const ratioX = 800 / Math.max(1, rect.width);
              const ratioY = 460 / Math.max(1, rect.height);
              const dx = (e.clientX - dragStartRef.current.x) * ratioX;
              const dy = (e.clientY - dragStartRef.current.y) * ratioY;
              setPanOffset({
                x: dragStartRef.current.origX + dx,
                y: dragStartRef.current.origY + dy
              });
            }}
            onPointerUp={() => {
              dragStartRef.current = null;
            }}
            onPointerCancel={() => {
              dragStartRef.current = null;
            }}
            title="Krokiyi sürükleyerek hizalayabilirsiniz"
          >
            {reportData ? (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${reportData.width} ${reportData.height}`}
                className="w-full h-full"
              >
                <defs>
                  <pattern id="simpleGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f1f5f9" strokeWidth="0.75" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#simpleGrid)" />

                {/* Ana Parsel Sınırı */}
                {reportData.mainPath && (
                  <path
                    d={reportData.mainPath}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="2"
                    strokeDasharray="6,4"
                  />
                )}

                {/* İfraz Parselleri */}
                {reportData.parcelItems.map((pi, idx) => {
                  const subtleFills = ['#f8fafc', '#f1f5f9'];
                  return (
                    <g key={pi.id}>
                      <path
                        d={pi.pathD}
                        fill={subtleFills[idx % subtleFills.length]}
                        fillOpacity="0.85"
                        stroke="#1e293b"
                        strokeWidth="1.5"
                      />

                      {/* İfraz Cepheleri / Kenar Uzunlukları (Aç/Kapat kontrollü) */}
                      {showFrontages &&
                        pi.edges.map((e, eIdx) => (
                          <g key={eIdx} transform={`translate(${e.midX}, ${e.midY}) rotate(${e.angle})`}>
                            <rect
                              x="-16"
                              y="-6.5"
                              width="32"
                              height="12"
                              fill="#ffffff"
                              fillOpacity="0.92"
                              stroke="#cbd5e1"
                              strokeWidth="0.6"
                              rx="1.5"
                            />
                            <text
                              x="0"
                              y="2.5"
                              fontSize="8"
                              fontWeight="600"
                              textAnchor="middle"
                              fill="#0f172a"
                              fontFamily="monospace"
                            >
                              {e.len.toFixed(1)}m
                            </text>
                          </g>
                        ))}

                      {/* Parsel Numarası ve Alanı */}
                      <text
                        x={pi.cx}
                        y={pi.cy - 3}
                        fontSize="11"
                        fontWeight="700"
                        fill="#0f172a"
                        textAnchor="middle"
                      >
                        {parcels.length > 0 ? pi.index : `${adaNo}/${parselNo}`}
                      </text>
                      <text
                        x={pi.cx}
                        y={pi.cy + 10}
                        fontSize="9"
                        fontWeight="600"
                        fill="#334155"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {pi.area.toFixed(1)} m²
                      </text>
                    </g>
                  );
                })}

                {/* İmar / Yol Çizgileri */}
                {reportData.roadPaths.map((rp, rIdx) => (
                  <path
                    key={rIdx}
                    d={rp}
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray="6,4"
                  />
                ))}

                {/* Köşe Noktaları P1, P2... (Aç/Kapat kontrollü) */}
                {showCoordinates &&
                  reportData.uniquePoints.map((pt) => (
                    <g key={pt.pointNo}>
                      <circle
                        cx={pt.px}
                        cy={pt.py}
                        r="3"
                        fill="#ffffff"
                        stroke="#0f172a"
                        strokeWidth="1.25"
                      />
                      <rect
                        x={pt.px + 4}
                        y={pt.py - 10}
                        width={pt.label.length * 5.8 + 4}
                        height="11"
                        fill="#ffffff"
                        fillOpacity="0.88"
                        rx="1.5"
                      />
                      <text
                        x={pt.px + 6}
                        y={pt.py - 2}
                        fontSize="8"
                        fontWeight="700"
                        fill="#0f172a"
                        fontFamily="monospace"
                      >
                        {pt.label}
                      </text>
                    </g>
                  ))}

                {/* Grafik Ölçek Çubuğu (Sol Alt Köşe) */}
                <g transform={`translate(18, ${reportData.height - 24})`}>
                  <rect
                    x="-6"
                    y="-12"
                    width={Math.max(70, reportData.scaleBarPx + 18)}
                    height="22"
                    fill="#ffffff"
                    fillOpacity="0.9"
                    stroke="#cbd5e1"
                    strokeWidth="0.7"
                    rx="2"
                  />
                  <line
                    x1="0"
                    y1="2"
                    x2={reportData.scaleBarPx}
                    y2="2"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                  <line x1="0" y1="-2" x2="0" y2="5" stroke="#0f172a" strokeWidth="1.5" />
                  <line
                    x1={reportData.scaleBarPx / 2}
                    y1="0"
                    x2={reportData.scaleBarPx / 2}
                    y2="4"
                    stroke="#0f172a"
                    strokeWidth="1"
                  />
                  <line
                    x1={reportData.scaleBarPx}
                    y1="-2"
                    x2={reportData.scaleBarPx}
                    y2="5"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                  <text x="0" y="-4" fontSize="8" fontFamily="monospace" fill="#0f172a" fontWeight="600">
                    0
                  </text>
                  <text
                    x={reportData.scaleBarPx}
                    y="-4"
                    fontSize="8"
                    fontFamily="monospace"
                    fill="#0f172a"
                    fontWeight="700"
                    textAnchor="end"
                  >
                    {reportData.scaleBarMeters} m
                  </text>
                </g>
              </svg>
            ) : (
              <div className="text-center p-8 text-xs text-slate-500">
                Çizim verisi bulunamadı. Haritada parsel seçin veya çizin.
              </div>
            )}
          </div>
        </section>

        {/* Bölüm: İfraz Parselleri ve Cepheleri */}
        {showFrontages && reportData && reportData.parcelItems.length > 0 && (
          <section className="space-y-1.5 break-inside-avoid">
            <div className="flex items-baseline justify-between border-b border-slate-300 pb-1">
              <h2 className="text-xs font-bold text-slate-900">
                {nextSectionNumber++}. İfraz Parselleri ve Cepheleri
              </h2>
              <span className="text-[10px] font-mono tabular-nums text-slate-600">
                Toplam: {reportData.parcelItems.length} Parsel · {totalAreaM2.toFixed(2)} m²
              </span>
            </div>

            <table className="w-full text-left text-[10px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-300 text-slate-700 font-semibold">
                  <th className="py-1.5 px-2 border-r border-slate-200">Parsel</th>
                  <th className="py-1.5 px-2 border-r border-slate-200 text-right">Alan (m²)</th>
                  <th className="py-1.5 px-2 border-r border-slate-200 text-right">Yol Cephesi</th>
                  <th className="py-1.5 px-2 border-r border-slate-200 text-right">Arka Bitiş</th>
                  <th className="py-1.5 px-2 border-r border-slate-200 text-right">Derinlik</th>
                  <th className="py-1.5 px-2 border-r border-slate-200">Kenar / Cephe Ölçüleri (m)</th>
                  <th className="py-1.5 px-2 text-center">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {reportData.parcelItems.map((pi) => (
                  <tr key={pi.id} className="break-inside-avoid">
                    <td className="py-1.5 px-2 border-r border-slate-200 font-semibold whitespace-nowrap">
                      {parcels.length > 0 ? `${pi.index}. ${pi.name}` : pi.name}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-200 text-right font-mono tabular-nums font-semibold">
                      {pi.area.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-200 text-right font-mono tabular-nums">
                      {pi.frontage > 0 ? `${pi.frontage.toFixed(2)} m` : '—'}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-200 text-right font-mono tabular-nums">
                      {pi.rearWidth > 0 ? `${pi.rearWidth.toFixed(2)} m` : '—'}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-200 text-right font-mono tabular-nums">
                      {pi.depth > 0 ? `${pi.depth.toFixed(2)} m` : '—'}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-200 font-mono tabular-nums text-[9.5px] text-slate-700 leading-relaxed">
                      {pi.edges.map((e) => `${e.fromLabel}–${e.toLabel}: ${e.len.toFixed(2)}m`).join(' · ')}
                    </td>
                    <td className="py-1.5 px-2 text-center font-medium whitespace-nowrap">
                      {pi.isValid ? (
                        <span className="text-emerald-700">Uygun</span>
                      ) : (
                        <span className="text-rose-700">Kontrol</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Bölüm: Köşe Koordinat Listesi (TUREF / UTM / WGS84) */}
        {showCoordinates && reportData && reportData.uniquePoints.length > 0 && (
          <section className="space-y-1.5">
            <div className="flex items-baseline justify-between border-b border-slate-300 pb-1">
              <h2 className="text-xs font-bold text-slate-900">
                {nextSectionNumber}. Köşe Koordinat Listesi
              </h2>
              <span className="text-[10px] font-mono text-slate-600">
                {systemSummaryText} · {reportData.uniquePoints.length} Nokta
              </span>
            </div>

            <table className="w-full text-left text-[10px] font-mono tabular-nums border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-300 text-slate-700 font-sans font-semibold">
                  <th className="py-1.5 px-2 border-r border-slate-200 w-16">Nokta</th>
                  <th className="py-1.5 px-2 border-r border-slate-200 text-right">{coordColX}</th>
                  <th className="py-1.5 px-2 border-r border-slate-200 text-right">{coordColY}</th>
                  <th className="py-1.5 px-2 border-r border-slate-200">Dilim / Sistem</th>
                  <th className="py-1.5 px-2 font-sans">Ait Olduğu Parsel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {reportData.uniquePoints.map((pt) => {
                  const formatted = formatCoordinateInSystem(
                    pt.lng,
                    pt.lat,
                    coordSystem,
                    coordSystem === 'TUREF_TM3' ? activeDom : undefined
                  );
                  return (
                    <tr key={pt.pointNo} className="break-inside-avoid">
                      <td className="py-1 px-2 border-r border-slate-200 font-bold text-slate-900">
                        {pt.label}
                      </td>
                      <td className="py-1 px-2 border-r border-slate-200 text-right">
                        {formatted.xFormatted}
                      </td>
                      <td className="py-1 px-2 border-r border-slate-200 text-right">
                        {formatted.yFormatted}
                      </td>
                      <td className="py-1 px-2 border-r border-slate-200 text-[9.5px] text-slate-600">
                        {formatted.zoneLabel}
                      </td>
                      <td className="py-1 px-2 font-sans text-[10px] text-slate-700">
                        {pt.parcelNames.join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Sade Alt Bilgi */}
        <footer className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-200">
          <span>İzgören Harita Mühendislik</span>
          <span className="font-mono">{systemSummaryText}</span>
          <span>
            {paperSize} {orientation === 'portrait' ? 'Dikey' : 'Yatay'} · {currentDate}
          </span>
        </footer>
      </div>
    </div>
  );
};
