import React, { useState, useMemo } from 'react';
import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import { GeneratedParcel, ParcelGeometry, SubdivisionConfig } from '../types';
import { 
  Printer, 
  X, 
  FileText, 
  Compass, 
  Edit3,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';

import { CadastralInfo } from '../utils/cadastralLocation';

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
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date());
  }, []);

  const totalAreaM2 = useMemo(() => {
    return parcels.reduce((sum, p) => sum + p.areaM2, 0);
  }, [parcels]);

  // Compute SVG coordinates from GeoJSON
  const svgData = useMemo(() => {
    if (!mainPolygon && parcels.length === 0) return null;

    try {
      const allFeatures: any[] = [];
      if (mainPolygon) allFeatures.push(mainPolygon);
      parcels.forEach((p) => allFeatures.push(p.feature));
      roadLines.forEach((rl) => allFeatures.push(rl));

      const fc = turf.featureCollection(allFeatures);
      const bbox = turf.bbox(fc); // [minLng, minLat, maxLng, maxLat]

      const minLng = bbox[0];
      const minLat = bbox[1];
      const maxLng = bbox[2];
      const maxLat = bbox[3];

      const lngSpan = Math.max(0.0001, maxLng - minLng);
      const latSpan = Math.max(0.0001, maxLat - minLat);

      const width = 800;
      const height = 680;
      const padding = 55;

      const scaleX = (width - padding * 2) / lngSpan;
      const scaleY = (height - padding * 2) / latSpan;
      const scale = Math.min(scaleX, scaleY);

      const offsetX = (width - lngSpan * scale) / 2;
      const offsetY = (height - latSpan * scale) / 2;

      const project = (lng: number, lat: number) => {
        const x = offsetX + (lng - minLng) * scale;
        // Invert Y because SVG Y goes down while Latitude goes up
        const y = height - (offsetY + (lat - minLat) * scale);
        return [x, y];
      };

      // Main Boundary Path
      let mainPath = '';
      if (mainPolygon) {
        let coords: [number, number][] = [];
        if (mainPolygon.geometry.type === 'Polygon') coords = mainPolygon.geometry.coordinates[0] as [number, number][];
        else if (mainPolygon.geometry.type === 'MultiPolygon') coords = mainPolygon.geometry.coordinates[0][0] as [number, number][];

        if (coords.length > 0) {
          mainPath = coords.map((c, i) => {
            const [px, py] = project(c[0], c[1]);
            return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
          }).join(' ') + ' Z';
        }
      }

      // Parcel Paths and Centroids
      const parcelItems = parcels.map((p, pIdx) => {
        let coords: [number, number][] = [];
        if (p.feature.geometry.type === 'Polygon') coords = p.feature.geometry.coordinates[0] as [number, number][];
        else if (p.feature.geometry.type === 'MultiPolygon') coords = p.feature.geometry.coordinates[0][0] as [number, number][];

        const pathD = coords.map((c, i) => {
          const [px, py] = project(c[0], c[1]);
          return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
        }).join(' ') + ' Z';

        const center = turf.centerOfMass(p.feature);
        const [cx, cy] = project(center.geometry.coordinates[0], center.geometry.coordinates[1]);

        // Edges and parallel dimensions
        const edges: { x1: number; y1: number; x2: number; y2: number; midX: number; midY: number; len: number; angle: number }[] = [];
        for (let i = 0; i < coords.length - 1; i++) {
          const [x1, y1] = project(coords[i][0], coords[i][1]);
          const [x2, y2] = project(coords[i + 1][0], coords[i + 1][1]);
          const len = turf.distance(turf.point(coords[i]), turf.point(coords[i + 1]), { units: 'meters' });
          if (len < 0.5) continue;

          let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
          while (angle > 90) angle -= 180;
          while (angle < -90) angle += 180;

          edges.push({
            x1, y1, x2, y2,
            midX: (x1 + x2) / 2,
            midY: (y1 + y2) / 2,
            len: Math.round(len * 10) / 10,
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
          depth: p.depthM,
          isValid: p.isValid,
          edges
        };
      });

      // Road Lines Path
      const roadPaths = roadLines.map((rl) => {
        const coords = rl.geometry.coordinates;
        return coords.map((c, i) => {
          const [px, py] = project(c[0], c[1]);
          return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
        }).join(' ');
      });

      return {
        width,
        height,
        mainPath,
        parcelItems,
        roadPaths
      };
    } catch (err) {
      console.warn('SVG plot error:', err);
      return null;
    }
  }, [mainPolygon, parcels, roadLines]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-2xl overflow-y-auto flex flex-col items-center p-3 md:p-6 animate-in fade-in duration-200">
      {/* Top Floating Control Bar - Hidden during print */}
      <div className="no-print w-full max-w-4xl apple-glass rounded-2xl p-3.5 shadow-2xl mb-4 text-white flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xs">
            İZG
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <span>İfraz ve Tevhid Uygulama Krokisi</span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
                Ölçekli Çizim
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 font-normal">
              İzgören Harita • Yalnızca ölçekli uygulama krokisi ve cephe ölçüleri
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={() => setShowEditDrawer(!showEditDrawer)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-200 transition"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Ada / Parsel Düzenle</span>
            {showEditDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-medium rounded-xl text-xs shadow-[0_2px_12px_rgba(59,130,246,0.35)] transition active:scale-[0.98]"
          >
            <Printer className="w-3.5 h-3.5 stroke-[2]" />
            <span>Yazdır / PDF</span>
          </button>

          <button
            onClick={() => {
              window.dispatchEvent(new Event('resize'));
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 active:bg-white/20 text-white font-medium rounded-xl text-xs transition active:scale-[0.98] border border-white/10"
            title="Krokiyi Yenile / Güncelle"
          >
            <RefreshCw className="w-3.5 h-3.5 stroke-[2]" />
            <span>Güncelle</span>
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Edit Drawer for Cadastral Details (İl, İlçe, Mahalle, Ada, Parsel, Mevkii, Nitelik) */}
      {showEditDrawer && (
        <div className="no-print w-full max-w-4xl apple-glass rounded-2xl p-4 shadow-xl mb-4 text-white border border-white/10 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="text-[11px] font-semibold text-amber-400 mb-2 flex items-center justify-between">
            <span>Kadastro & Parsel Bilgilerini Düzenle</span>
            <span className="text-[10px] text-slate-400 font-normal">Yüklenen dosya ve koordinat verilerinden otomatik aktarılmıştır</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">İl</label>
              <input
                type="text"
                value={il}
                onChange={(e) => {
                  setIl(e.target.value);
                  onUpdateCadastralInfo?.({ il: e.target.value, ilce, mahalle, adaNo, parselNo, mevkii, nitelik });
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">İlçe</label>
              <input
                type="text"
                value={ilce}
                onChange={(e) => {
                  setIlce(e.target.value);
                  onUpdateCadastralInfo?.({ il, ilce: e.target.value, mahalle, adaNo, parselNo, mevkii, nitelik });
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Mahalle / Köy</label>
              <input
                type="text"
                value={mahalle}
                onChange={(e) => {
                  setMahalle(e.target.value);
                  onUpdateCadastralInfo?.({ il, ilce, mahalle: e.target.value, adaNo, parselNo, mevkii, nitelik });
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Ada No</label>
              <input
                type="text"
                value={adaNo}
                onChange={(e) => {
                  setAdaNo(e.target.value);
                  onUpdateCadastralInfo?.({ il, ilce, mahalle, adaNo: e.target.value, parselNo, mevkii, nitelik });
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Parsel No</label>
              <input
                type="text"
                value={parselNo}
                onChange={(e) => {
                  setParselNo(e.target.value);
                  onUpdateCadastralInfo?.({ il, ilce, mahalle, adaNo, parselNo: e.target.value, mevkii, nitelik });
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Mevkii</label>
              <input
                type="text"
                value={mevkii}
                onChange={(e) => {
                  setMevkii(e.target.value);
                  onUpdateCadastralInfo?.({ il, ilce, mahalle, adaNo, parselNo, mevkii: e.target.value, nitelik });
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Nitelik</label>
              <input
                type="text"
                value={nitelik}
                onChange={(e) => {
                  setNitelik(e.target.value);
                  onUpdateCadastralInfo?.({ il, ilce, mahalle, adaNo, parselNo, mevkii, nitelik: e.target.value });
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Printable Sheet (Standard A4 Scaled Sketch Only) */}
      <div className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-2xl p-6 sm:p-8 border border-slate-300 font-sans print:border-none print:shadow-none print:p-0 print:m-0 print:w-full print:max-w-none flex flex-col justify-between">
        
        {/* SADECE İFRAZ VE TEVHİD UYGULAMA KROKİSİ (ÖLÇEKLİ ÇİZİM) */}
        <div className="border-2 border-slate-900 rounded-xl p-4 bg-white flex flex-col flex-1 shadow-sm">
          
          {/* Kroki Başlık & Üst Bilgi Şeridi */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b-2 border-slate-900 pb-3 mb-3 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-700 shrink-0" />
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
                  İFRAZ VE TEVHİD UYGULAMA KROKİSİ
                </h1>
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                  ÖLÇEKLİ ÇİZİM
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5 font-medium flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-700">İZGÖREN HARİTA MÜHENDİSLİK</span>
                <span>•</span>
                <span>{il} / {ilce}</span>
                <span>•</span>
                <span>{mahalle}</span>
                <span>•</span>
                <span className="font-mono">Ada: <strong>{adaNo}</strong> | Kök Parsel: <strong>{parselNo}</strong></span>
                {mevkii && (
                  <>
                    <span>•</span>
                    <span>Mevkii: <strong>{mevkii}</strong></span>
                  </>
                )}
              </div>
            </div>

            {/* Kroki Lejantı & Ölçek */}
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-amber-500 inline-block rounded-sm"></span>
                <span>Yol Sınırı</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border border-slate-700 bg-white inline-block rounded-sm"></span>
                <span>İfraz Sınırı</span>
              </span>
              <span className="font-bold text-slate-900 border-l border-slate-300 pl-2">
                Ölçek: 1/1000 Simüle
              </span>
            </div>
          </div>

          {/* Scaled Cadastral SVG Drawing Canvas */}
          <div className="relative w-full flex-1 min-h-[580px] sm:min-h-[640px] bg-white border border-slate-300 rounded-lg overflow-hidden flex items-center justify-center">
            
            {/* North Arrow Compass Indicator */}
            <div className="absolute top-3 right-3 bg-white/95 border border-slate-300 rounded-lg p-2 shadow-sm flex flex-col items-center text-[10px] font-bold text-slate-800 z-10">
              <Compass className="w-6 h-6 text-rose-600 animate-pulse" />
              <span className="mt-0.5">K (N)</span>
            </div>

            {/* Graphic Scale Bar */}
            <div className="absolute bottom-3 left-3 bg-white/95 border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-sm text-[10px] font-mono text-slate-700 z-10 flex items-center gap-2">
              <span className="font-bold">0</span>
              <div className="w-20 h-2 border border-slate-700 flex">
                <div className="w-1/2 bg-slate-900"></div>
                <div className="w-1/2 bg-white"></div>
              </div>
              <span className="font-bold">25m</span>
            </div>

            {/* Corner CAD Antet (Harita Mühendisliği Kroki Bilgi Köşesi) */}
            <div className="absolute bottom-3 right-3 bg-white/95 border-2 border-slate-800 rounded-lg p-2.5 shadow-sm text-[10px] font-sans text-slate-800 z-10 w-64">
              <div className="border-b border-slate-200 pb-1 mb-1 flex items-center justify-between">
                <span className="font-black text-[11px] text-slate-900">İZGÖREN HARİTA</span>
                <span className="text-[9px] font-mono text-amber-800 font-bold">HKMO TESCİLLİ</span>
              </div>
              <div className="space-y-0.5 text-[9.5px] font-mono text-slate-600">
                <div>İl / İlçe: <strong className="text-slate-900">{il} / {ilce}</strong></div>
                <div>Mahalle / Mevkii: <strong className="text-slate-900">{mahalle} • {mevkii}</strong></div>
                <div>Ada / Parsel: <strong className="text-slate-900">{adaNo} / {parselNo}</strong></div>
                <div>Nitelik: <strong className="text-slate-900">{nitelik}</strong></div>
                <div>Toplam Alan: <strong className="text-slate-900">{totalAreaM2.toFixed(1)} m²</strong> ({parcels.length} Parsel)</div>
                <div>Tarih: <strong className="text-slate-900">{currentDate}</strong></div>
              </div>
            </div>

            {/* Vector SVG Render */}
            {svgData ? (
              <svg 
                viewBox={`0 0 ${svgData.width} ${svgData.height}`} 
                className="w-full h-full"
                style={{ maxHeight: '100%' }}
              >
                {/* Background Gridlines */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f1f5f9" strokeWidth="0.75" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Main Cadastral Boundary (Dashed Outer Outline) */}
                {svgData.mainPath && (
                  <path
                    d={svgData.mainPath}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="2.5"
                    strokeDasharray="6,4"
                  />
                )}

                {/* Subdivided Parcels */}
                {svgData.parcelItems.map((pi, idx) => {
                  const colors = ['#f8fafc', '#f1f5f9', '#f0fdf4', '#eff6ff', '#faf5ff'];
                  const fillColor = colors[idx % colors.length];

                  return (
                    <g key={pi.id}>
                      <path
                        d={pi.pathD}
                        fill={fillColor}
                        stroke="#1e293b"
                        strokeWidth="2"
                      />

                      {/* Parallel Edge Length Measurements (Çizgiye Paralel Ölçüler) */}
                      {pi.edges.map((e, eIdx) => (
                        <g key={eIdx} transform={`translate(${e.midX}, ${e.midY}) rotate(${e.angle})`}>
                          <rect
                            x="-18"
                            y="-7"
                            width="36"
                            height="13"
                            fill="#ffffff"
                            stroke="#475569"
                            strokeWidth="0.75"
                            rx="2"
                          />
                          <text
                            x="0"
                            y="2.8"
                            fontSize="8.5"
                            fontWeight="bold"
                            textAnchor="middle"
                            fill="#0f172a"
                            fontFamily="monospace"
                          >
                            {e.len}m
                          </text>
                        </g>
                      ))}

                      {/* Parcel Center Badge & Area */}
                      <circle cx={pi.cx} cy={pi.cy - 9} r="11" fill="#0f172a" />
                      <text
                        x={pi.cx}
                        y={pi.cy - 5}
                        fontSize="10"
                        fontWeight="bold"
                        fill="#ffffff"
                        textAnchor="middle"
                      >
                        {pi.index}
                      </text>
                      <rect
                        x={pi.cx - 28}
                        y={pi.cy + 5}
                        width="56"
                        height="14"
                        fill="#ffffff"
                        stroke="#cbd5e1"
                        strokeWidth="0.5"
                        rx="3"
                      />
                      <text
                        x={pi.cx}
                        y={pi.cy + 15}
                        fontSize="9.5"
                        fontWeight="bold"
                        fill="#0f172a"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {pi.area.toFixed(1)} m²
                      </text>
                    </g>
                  );
                })}

                {/* Drawn Road Lines */}
                {svgData.roadPaths.map((rp, rIdx) => (
                  <path
                    key={rIdx}
                    d={rp}
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="8,4"
                  />
                ))}
              </svg>
            ) : (
              <div className="text-center p-8 text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Çizim verisi bulunamadı veya henüz parsel oluşturulmadı.</p>
              </div>
            )}
          </div>

          {/* Alt Özet Şeridi */}
          <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono mt-3 pt-2 border-t border-slate-200">
            <span>İzgören Harita Mühendislik ve Müşavirlik Bürosu</span>
            <span>Toplam {parcels.length} İfraz Parseli | {totalAreaM2.toFixed(1)} m²</span>
            <span>Kadastro Parselasyon ve Tescile Esas Uygulama Krokisi</span>
          </div>

        </div>

      </div>
    </div>
  );
};
