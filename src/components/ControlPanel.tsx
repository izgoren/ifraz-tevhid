import React, { useState } from 'react';
import {
  Undo,
  Redo,
  FolderOpen,
  Layers,
  Scissors,
  Download,
  ChevronLeft,
  FileSpreadsheet,
  Compass,
  Printer,
  Navigation,
  RefreshCw,
  X,
  Sun,
  Moon,
  Sliders,
  Save,
  RotateCcw,
  SaveAll,
  Hash,
  Columns,
  Smartphone,
  CheckCircle2,
  Sparkles,
  Ruler,
  Lock,
  Unlock,
  Mountain,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Globe,
  PenTool,
  Shapes,
  Type,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { Feature, LineString } from 'geojson';
import { GeneratedParcel, MapSettings, StatsSummary, SubdivisionConfig } from '../types';
import { ParcelEdge, calculateMultiEdgeFrontage } from '../utils/geometryOptimizer';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface ControlPanelProps {
  config: SubdivisionConfig;
  onChangeConfig: (newConfig: SubdivisionConfig) => void;
  mapSettings: MapSettings;
  onChangeMapSettings: (newSettings: MapSettings) => void;
  stats?: StatsSummary;
  parcels: GeneratedParcel[];
  selectedParcelIds: string[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onKMLUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMergeSelected: () => void;
  onExportKML: () => void;
  onExportGeoJSON: () => void;
  onExportCSV: () => void;
  onReset: () => void;
  onUpdateParcelAttributes: (parcelId: string, attrs: any) => void;
  statusMessage?: string;
  onOpenPrintModal?: () => void;
  onOpenSoilAnalysis?: (tab?: 'soil' | 'slope') => void;
  onRecalculate?: () => void;
  roadLines?: Feature<LineString>[];
  mainPolygonEdges?: ParcelEdge[];
  selectedFrontageEdgeIndices?: number[];
  isSelectingFrontageEdge?: boolean;
  edgeSelectionMode?: 'none' | 'road' | 'left' | 'right';
  onSetEdgeSelectionMode?: (mode: 'none' | 'road' | 'left' | 'right') => void;
  onToggleSelectFrontageEdge?: () => void;
  onToggleFrontageEdge?: (edgeIndex: number) => void;
  onClearFrontage?: () => void;
  onSaveSettings?: () => void;
  onResetSettings?: () => void;
  isSettingsSaved?: boolean;
  isDrawingPolygon?: boolean;
  onToggleDrawPolygon?: () => void;
}

const BASEMAP_OPTIONS = [
  {
    id: 'googleHybrid',
    label: 'Hibrit Uydu',
    sublabel: 'Google Uydu + Yol & İsimler'
  },
  {
    id: 'googleSatellite',
    label: 'Saf Uydu',
    sublabel: 'Yüksek Çözünürlüklü Hava Fotoğrafı'
  },
  {
    id: 'osm',
    label: 'Standart Sokak',
    sublabel: 'Vektörel İmar & Sokak Haritası'
  }
] as const;

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  onChangeConfig,
  mapSettings,
  onChangeMapSettings,
  parcels = [],
  selectedParcelIds,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onKMLUpload,
  onMergeSelected,
  onExportKML,
  onExportGeoJSON,
  onExportCSV,
  onReset,
  onOpenPrintModal,
  onOpenSoilAnalysis,
  onRecalculate,
  mainPolygonEdges = [],
  selectedFrontageEdgeIndices = [],
  isSelectingFrontageEdge = false,
  edgeSelectionMode = 'none',
  onSetEdgeSelectionMode,
  onToggleSelectFrontageEdge,
  onClearFrontage,
  onSaveSettings,
  onResetSettings,
  isSettingsSaved = false,
  isDrawingPolygon = false,
  onToggleDrawPolygon
}) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const [showSaveAsMenu, setShowSaveAsMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showBaseMapMenu, setShowBaseMapMenu] = useState(false);
  const [showPiecePopover, setShowPiecePopover] = useState(false);
  const [showAnglePopover, setShowAnglePopover] = useState(false);
  const [showDoubleRowPopover, setShowDoubleRowPopover] = useState(false);

  // PWA and Service Worker Update Hooks
  const { hasUpdate, isChecking, lastCheckedText, checkForUpdate, applyUpdate } = useServiceWorkerUpdate();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const handleConfigChange = <K extends keyof SubdivisionConfig>(key: K, value: SubdivisionConfig[K]) => {
    onChangeConfig({ ...config, [key]: value });
  };

  const handleSettingChange = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => {
    onChangeMapSettings({ ...mapSettings, [key]: value });
  };

  // Multi-edge road frontage calculation
  const multiFrontage = calculateMultiEdgeFrontage(mainPolygonEdges, selectedFrontageEdgeIndices);

  const currentBaseMapOption = BASEMAP_OPTIONS.find((opt) => opt.id === mapSettings.tileProvider) || BASEMAP_OPTIONS[0];

  return (
    <>
      {/* ================= APPLE DYNAMIC ISLAND TOP ACTION BAR ================= */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] h-11 px-3.5 apple-glass rounded-full flex items-center gap-2 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-all animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/15 disabled:opacity-25 disabled:hover:bg-transparent transition text-slate-200"
          title="Geri Al (Ctrl+Z)"
        >
          <Undo className="w-3.5 h-3.5 stroke-[1.75]" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/15 disabled:opacity-25 disabled:hover:bg-transparent transition text-slate-200"
          title="İleri Al (Ctrl+Y)"
        >
          <Redo className="w-3.5 h-3.5 stroke-[1.75]" />
        </button>

        {/* Kadastro Dosyası Aç (Birden Çok KML / GeoJSON Seçilebilir) */}
        <label
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/15 cursor-pointer transition text-amber-400 hover:text-amber-300"
          title="Kadastro Dosyaları Aç (Birden Çok KML / GeoJSON Seçebilirsiniz)"
        >
          <FolderOpen className="w-3.5 h-3.5 stroke-[1.75]" />
          <input
            type="file"
            multiple
            accept=".kml,.geojson,.json"
            onChange={onKMLUpload}
            className="hidden"
          />
        </label>

        {/* Farklı Kaydet & Dışa Aktar Butonu */}
        <div className="relative">
          <button
            onClick={() => setShowSaveAsMenu((prev) => !prev)}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
              showSaveAsMenu
                ? 'bg-blue-500 text-white shadow-sm'
                : 'hover:bg-white/10 active:bg-white/15 text-blue-400 hover:text-blue-300'
            }`}
            title="Farklı Kaydet & Dışa Aktar (PDF, KML, GeoJSON, CSV)"
          >
            <SaveAll className="w-3.5 h-3.5 stroke-[1.75]" />
          </button>

          {/* Farklı Kaydet Menüsü */}
          {showSaveAsMenu && (
            <div className="absolute top-full left-0 mt-2 z-[1100] w-64 apple-glass rounded-2xl p-2 shadow-2xl border border-white/15 text-slate-100 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/[0.08] mb-1 flex items-center justify-between">
                <span>Farklı Kaydet & Rapor</span>
                <button
                  onClick={() => setShowSaveAsMenu(false)}
                  className="text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-white/10"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {onOpenPrintModal && (
                <button
                  onClick={() => {
                    setShowSaveAsMenu(false);
                    onOpenPrintModal();
                  }}
                  className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-white text-xs py-2 px-2.5 rounded-xl flex items-center justify-between border border-blue-500/30 transition text-left"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                    <span>Uygulama Krokisi (A4)</span>
                  </span>
                  <span className="text-[10px] bg-blue-500/30 text-blue-200 px-1.5 py-0.5 rounded font-mono">PDF</span>
                </button>
              )}
              <button
                onClick={() => {
                  setShowSaveAsMenu(false);
                  onExportKML();
                }}
                className="w-full hover:bg-white/10 text-slate-200 hover:text-white text-xs py-2 px-2.5 rounded-xl flex items-center justify-between transition text-left"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />
                  <span>Google Earth KML</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">.kml</span>
              </button>
              <button
                onClick={() => {
                  setShowSaveAsMenu(false);
                  onExportGeoJSON();
                }}
                className="w-full hover:bg-white/10 text-slate-200 hover:text-white text-xs py-2 px-2.5 rounded-xl flex items-center justify-between transition text-left"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                  <span>CBS GeoJSON</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">.geojson</span>
              </button>
              <button
                onClick={() => {
                  setShowSaveAsMenu(false);
                  onExportCSV();
                }}
                className="w-full hover:bg-white/10 text-slate-200 hover:text-white text-xs py-2 px-2.5 rounded-xl flex items-center justify-between transition text-left"
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                  <span>Koordinat Tablosu</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">.csv</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-3.5 w-px bg-white/15 mx-0.5" />

        <div className="flex items-center gap-2 px-1 text-xs font-semibold tracking-tight text-slate-100">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span>İzgören Harita</span>
        </div>

        <div className="h-3.5 w-px bg-white/15 mx-0.5" />

        {/* Hızlı Yazdır Butonu */}
        {onOpenPrintModal && (
          <button
            onClick={onOpenPrintModal}
            className="h-8 px-3.5 bg-white/10 hover:bg-white/15 active:bg-white/20 text-white text-xs font-medium rounded-full flex items-center gap-1.5 transition active:scale-95 border border-white/10 shadow-sm"
            title="Hızlı Yazdır (A4 Kadastro Uygulama Krokisi Çıktısı Al)"
          >
            <Printer className="w-3.5 h-3.5 text-slate-300 stroke-[1.75]" />
            <span>Hızlı Yazdır</span>
          </button>
        )}

        {/* Altlık Harita Menüsü Butonu (Ayarlar'ın Yanında) */}
        <div className="relative">
          <button
            onClick={() => {
              setShowBaseMapMenu((prev) => !prev);
              setShowSettingsMenu(false);
            }}
            className={`h-8 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 active:scale-95 border ${
              showBaseMapMenu
                ? 'bg-blue-500 text-white font-bold border-blue-400 shadow-sm'
                : 'bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border-white/10'
            }`}
            title={`Altlık Harita: ${currentBaseMapOption.label} (Değiştirmek için tıklayın)`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
            <span>{currentBaseMapOption.label}</span>
          </button>

          {/* Altlık Harita Popover Menüsü */}
          {showBaseMapMenu && (
            <div className="absolute top-full right-0 mt-2 z-[1100] w-64 apple-glass rounded-2xl p-2.5 shadow-2xl border border-white/15 text-slate-100 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between px-2 py-1 border-b border-white/[0.08] text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Altlık Harita</span>
                </span>
                <button
                  onClick={() => setShowBaseMapMenu(false)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-1 pt-1">
                {BASEMAP_OPTIONS.map((opt) => {
                  const isSelected = mapSettings.tileProvider === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        handleSettingChange('tileProvider', opt.id as any);
                        setShowBaseMapMenu(false);
                      }}
                      className={`w-full py-2 px-2.5 rounded-xl text-left transition flex items-center justify-between text-xs ${
                        isSelected
                          ? 'bg-blue-500/25 text-white font-bold border border-blue-400/40 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-[12px]">{opt.label}</span>
                        <span className="text-[10px] text-slate-400">{opt.sublabel}</span>
                      </div>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ayarlar Menüsü Butonu (Güncelleme gelince yeşil olur) */}
        <div className="relative">
          <button
            onClick={() => {
              setShowSettingsMenu((prev) => !prev);
              setShowBaseMapMenu(false);
            }}
            className={`h-8 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 active:scale-95 border ${
              hasUpdate
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)] animate-pulse'
                : showSettingsMenu
                ? 'bg-blue-500 text-white font-bold border-blue-400 shadow-sm'
                : 'bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border-white/10'
            }`}
            title={hasUpdate ? 'Yeni güncelleme mevcut! Tıklayarak yükleyin.' : 'Sistem ve Görünüm Ayarları'}
          >
            <Sliders className={`w-3.5 h-3.5 stroke-[2] ${hasUpdate ? 'text-white' : 'text-blue-400'}`} />
            <span>Ayarlar</span>
            {hasUpdate && (
              <span className="w-2 h-2 rounded-full bg-white shadow-sm shrink-0 animate-ping" />
            )}
          </button>

          {/* Ayarlar Popover Menüsü */}
          {showSettingsMenu && (
            <div className="absolute top-full right-0 mt-2 z-[1100] w-72 apple-glass rounded-2xl p-3.5 shadow-2xl border border-white/15 text-slate-100 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Sliders className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                  <span>Sistem & Görünüm Ayarları</span>
                </div>
                <button
                  onClick={() => setShowSettingsMenu(false)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Görünüm & Tema: Gece / Gündüz */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Tema</label>
                <div className="bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleSettingChange('theme', 'dark')}
                    className={`py-1.5 px-2 rounded-lg text-center transition text-xs font-medium flex items-center justify-center gap-1.5 ${
                      mapSettings.theme === 'dark'
                        ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                    <span>Gece Modu</span>
                  </button>
                  <button
                    onClick={() => handleSettingChange('theme', 'light')}
                    className={`py-1.5 px-2 rounded-lg text-center transition text-xs font-medium flex items-center justify-center gap-1.5 ${
                      mapSettings.theme === 'light'
                        ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />
                    <span>Gündüz Modu</span>
                  </button>
                </div>
              </div>

              {/* Menü & Panel Saydamlığı */}
              <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-300 font-medium">Panel Saydamlığı:</span>
                  <span className="font-mono text-blue-400 font-bold">%{mapSettings.uiOpacity ?? 78}</span>
                </div>
                <input
                  type="range"
                  min={35}
                  max={100}
                  value={mapSettings.uiOpacity ?? 78}
                  onChange={(e) => handleSettingChange('uiOpacity', parseInt(e.target.value) || 78)}
                  className="w-full h-1 bg-white/10 rounded-full accent-blue-500 cursor-pointer"
                />
              </div>

              {/* Buton ve Yazı Boyutu (Arayüz Büyütme) */}
              <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    <Type className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Yazı & Buton Büyütme</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-cyan-300">
                    %{mapSettings.uiScale ?? 100}
                  </span>
                </div>

                {/* Hızlı Büyütme Butonları: Standart (%100), Büyük (%112), Ekstra Büyük (%125) */}
                <div className="grid grid-cols-3 gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => handleSettingChange('uiScale', 100)}
                    className={`py-1.5 px-2 rounded-lg text-center transition text-xs flex flex-col items-center gap-0.5 ${
                      (mapSettings.uiScale ?? 100) === 100
                        ? 'bg-cyan-500 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="text-[11px] leading-tight font-medium">Standart</span>
                    <span className="text-[9px] opacity-80 font-mono">%100</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSettingChange('uiScale', 112)}
                    className={`py-1.5 px-2 rounded-lg text-center transition text-xs flex flex-col items-center gap-0.5 ${
                      (mapSettings.uiScale ?? 100) === 112
                        ? 'bg-cyan-500 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="text-[11px] leading-tight font-medium">Büyük</span>
                    <span className="text-[9px] opacity-80 font-mono">%112</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSettingChange('uiScale', 125)}
                    className={`py-1.5 px-2 rounded-lg text-center transition text-xs flex flex-col items-center gap-0.5 ${
                      (mapSettings.uiScale ?? 100) === 125
                        ? 'bg-cyan-500 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="text-[11px] leading-tight font-medium">Çok Büyük</span>
                    <span className="text-[9px] opacity-80 font-mono">%125</span>
                  </button>
                </div>

                {/* İnce Ayar Kademeli Butonlar ve Slider */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSettingChange('uiScale', Math.max(90, (mapSettings.uiScale ?? 100) - 5))}
                    disabled={(mapSettings.uiScale ?? 100) <= 90}
                    className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/10 disabled:opacity-30 text-slate-300 hover:text-white flex items-center justify-center transition shrink-0"
                    title="Yazı ve butonları küçült (-%5)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    min={90}
                    max={130}
                    step={2}
                    value={mapSettings.uiScale ?? 100}
                    onChange={(e) => handleSettingChange('uiScale', parseInt(e.target.value) || 100)}
                    className="flex-1 h-1 bg-white/10 rounded-full accent-cyan-400 cursor-pointer"
                  />

                  <button
                    type="button"
                    onClick={() => handleSettingChange('uiScale', Math.min(130, (mapSettings.uiScale ?? 100) + 5))}
                    disabled={(mapSettings.uiScale ?? 100) >= 130}
                    className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/10 disabled:opacity-30 text-slate-300 hover:text-white flex items-center justify-center transition shrink-0"
                    title="Yazı ve butonları büyült (+%5)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Uygulama Güncellemesi (Güncelleme Gelince Yeşil Olur) */}
              <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Uygulama Güncellemesi
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">{lastCheckedText}</span>
                </div>

                {hasUpdate ? (
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 space-y-2 text-xs animate-in fade-in">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold">
                      <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span>Yeni Güncelleme Mevcut!</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Yeni kadastro ve harita özellikleri hazır. Hemen güncelleyin.
                    </p>
                    <button
                      onClick={applyUpdate}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-emerald-500/30 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Uygulamayı Güncelle (Yenile)</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={checkForUpdate}
                    disabled={isChecking}
                    className="w-full py-1.5 px-3 bg-white/[0.06] hover:bg-white/12 active:bg-white/20 text-slate-200 hover:text-white rounded-xl transition text-xs flex items-center justify-center gap-2 border border-white/10 active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-blue-400 stroke-[2] ${isChecking ? 'animate-spin' : ''}`} />
                    <span>{isChecking ? 'Denetleniyor...' : 'Güncellemeleri Denetle'}</span>
                  </button>
                )}
              </div>

              {/* PWA Yükle Menüsü */}
              <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Uygulama Modu (PWA)
                </label>
                {isInstalled ? (
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>PWA Uygulaması Yüklü</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <button
                      onClick={install}
                      className="w-full py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white font-bold rounded-xl transition text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 border border-blue-400/40 active:scale-95"
                    >
                      <Smartphone className="w-3.5 h-3.5 stroke-[2]" />
                      <span>PWA Yükle (Masaüstü / Mobil)</span>
                    </button>
                    {isIOS && (
                      <p className="text-[10px] text-slate-400 text-center">
                        iOS Safari: Paylaş butonu &gt; Ana Ekrana Ekle
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Ayarları Sakla / Sıfırla */}
              <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                <div className="flex items-center gap-2">
                  {onSaveSettings && (
                    <button
                      onClick={onSaveSettings}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium py-1.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.98] text-xs shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Ayarları Sakla</span>
                    </button>
                  )}
                  {onResetSettings && (
                    <button
                      onClick={onResetSettings}
                      className="py-1.5 px-2.5 bg-white/[0.05] hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition text-xs flex items-center gap-1"
                      title="Varsayılana Sıfırla"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Sıfırla</span>
                    </button>
                  )}
                </div>
                {isSettingsSaved && (
                  <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] text-center font-medium animate-in fade-in duration-200">
                    ✓ Ayarlarınız başarıyla saklandı!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected Parcels Merge Banner */}
        {selectedParcelIds.length >= 2 && (
          <>
            <div className="h-3.5 w-px bg-white/15 mx-0.5" />
            <button
              onClick={onMergeSelected}
              className="h-8 px-3.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-xs font-medium rounded-full flex items-center gap-1.5 transition active:scale-95 shadow-[0_2px_12px_rgba(16,185,129,0.35)] animate-in fade-in zoom-in-95"
              title="Seçili parselleri birleştirerek tek parsel yap"
            >
              <span>{selectedParcelIds.length} Parseli Birleştir (Tevhid)</span>
            </button>
          </>
        )}
      </div>

      {/* ================= SOL İFRAZ MENÜSÜ (SAĞ ÇİZİM ARAÇLARI GİBİ BUTONLU DOCK) ================= */}
      {/* Kapalı Durumda Açma Butonu */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 left-4 z-[990] h-11 px-3.5 apple-glass text-white font-medium text-xs rounded-full flex items-center gap-2 transition active:scale-95 hover:bg-slate-900/90 shadow-lg border border-white/10"
          title="İfraz Menüsünü Aç"
        >
          <Scissors className="w-4 h-4 text-blue-400 stroke-[2]" />
          <span className="font-semibold text-xs">İfraz</span>
        </button>
      )}

      {/* Açık Durumda Butonlu İfraz Menüsü */}
      {panelOpen && (
        <div className="absolute top-4 left-4 z-[990] w-52 apple-glass rounded-2xl p-2.5 space-y-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 text-white animate-in fade-in slide-in-from-left-2 duration-200 select-none">
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-1 border-b border-white/[0.08]">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
              <Scissors className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
              <span>İfraz</span>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Gizle"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Grup 1: Hesaplama & Parametreler */}
          <div className="space-y-1">
            <div className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Parsel & Parametreler</span>
            </div>

            {/* Elle Parsel Alanı Çiz Butonu */}
            {onToggleDrawPolygon && (
              <button
                onClick={onToggleDrawPolygon}
                className={`w-full h-8 px-2 rounded-xl text-xs font-semibold transition flex items-center justify-between active:scale-95 ${
                  isDrawingPolygon
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold shadow-lg shadow-blue-500/30 border border-cyan-300'
                    : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 hover:text-white border border-blue-500/30'
                }`}
                title="Harita üzerinde köşe noktalarını tıklayarak elle serbest parsel alanı çizin. Çizim esnasında dinamik kenar mesafeleri ve toplam alan anlık gösterilir."
              >
                <div className="flex items-center gap-1.5">
                  <PenTool className={`w-3.5 h-3.5 stroke-[2] ${isDrawingPolygon ? 'text-white animate-spin' : 'text-cyan-400'}`} />
                  <span className="text-[11px]">Elle Parsel Çiz</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                  isDrawingPolygon
                    ? 'bg-blue-900/90 text-cyan-200 border border-cyan-400/50 animate-pulse'
                    : 'bg-blue-400/20 text-blue-200'
                }`}>
                  {isDrawingPolygon ? 'ÇİZİLİYOR' : 'ALAN ÇİZ'}
                </span>
              </button>
            )}

            {/* Parça Sayısı Butonu & Popover */}
            <div className="relative">
              <button
                onClick={() => setShowPiecePopover((prev) => !prev)}
                className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  showPiecePopover
                    ? 'bg-blue-500 text-white font-bold shadow-md shadow-blue-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="İfraz Parça Sayısını Belirleyin"
              >
                <div className="flex items-center gap-1.5">
                  <Hash className={`w-3.5 h-3.5 stroke-[2] ${showPiecePopover ? 'text-white' : 'text-blue-400'}`} />
                  <span className="text-[11px]">Parça Sayısı</span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  showPiecePopover ? 'bg-blue-700 text-white' : 'text-blue-300 bg-blue-500/10'
                }`}>
                  {config.pieceCount === 0 ? '0' : `${config.pieceCount}`}
                </span>
              </button>

              {/* Parça Sayısı Popover */}
              {showPiecePopover && (
                <div className="absolute left-full top-0 ml-2 z-[1100] w-64 apple-glass rounded-2xl p-3 shadow-2xl border border-white/15 text-white space-y-2.5 animate-in fade-in slide-in-from-left-1 duration-150">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                    <span className="text-xs font-semibold text-slate-200">Parça Sayısı (İfraz Adedi)</span>
                    <span className="text-xs font-mono font-bold text-blue-400">
                      {config.pieceCount === 0 ? '0 (İfrazsız)' : `${config.pieceCount} Parsel`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={config.pieceCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      handleConfigChange('pieceCount', Number.isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="w-full h-1.5 bg-white/10 rounded-full accent-blue-500 cursor-pointer"
                  />
                  <div className="grid grid-cols-5 gap-1 pt-0.5">
                    {[0, 2, 4, 6, 8, 10, 12, 16, 20, 30].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleConfigChange('pieceCount', num)}
                        className={`text-[10px] py-1 rounded-lg font-mono transition border ${
                          config.pieceCount === num
                            ? 'bg-blue-500 text-white font-bold border-blue-400'
                            : 'bg-white/[0.04] text-slate-300 hover:text-white border-white/[0.06] hover:bg-white/10'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Kesim Açısı Butonu & Popover */}
            <div className="relative">
              <button
                onClick={() => setShowAnglePopover((prev) => !prev)}
                className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  showAnglePopover
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="İfraz Kesim Açısını Belirleyin (0° - 180°)"
              >
                <div className="flex items-center gap-1.5">
                  <Compass className={`w-3.5 h-3.5 stroke-[2] ${showAnglePopover ? 'text-slate-950' : 'text-amber-400'}`} />
                  <span className="text-[11px]">Kesim Açısı</span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  showAnglePopover ? 'bg-slate-950/20 text-slate-950' : 'text-amber-300 bg-amber-500/10'
                }`}>
                  {config.rotateAngle}°
                </span>
              </button>

              {/* Kesim Açısı Popover */}
              {showAnglePopover && (
                <div className="absolute left-full top-0 ml-2 z-[1100] w-64 apple-glass rounded-2xl p-3 shadow-2xl border border-white/15 text-white space-y-2.5 animate-in fade-in slide-in-from-left-1 duration-150">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                    <span className="text-xs font-semibold text-slate-200">İfraz Kesim Açısı</span>
                    <span className="text-xs font-mono font-bold text-amber-400">{config.rotateAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={180}
                    value={config.rotateAngle}
                    onChange={(e) => handleConfigChange('rotateAngle', parseFloat(e.target.value) || 0)}
                    className="w-full h-1.5 bg-white/10 rounded-full accent-amber-500 cursor-pointer"
                  />
                  <div className="grid grid-cols-5 gap-1 pt-0.5">
                    {[0, 45, 90, 135, 180].map((deg) => (
                      <button
                        key={deg}
                        onClick={() => handleConfigChange('rotateAngle', deg)}
                        className={`text-[10px] py-1 rounded-lg font-mono transition border ${
                          config.rotateAngle === deg
                            ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                            : 'bg-white/[0.04] text-slate-300 hover:text-white border-white/[0.06] hover:bg-white/10'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Çift Sıra İfraz Butonu & Popover */}
            <div className="relative">
              <button
                onClick={() => setShowDoubleRowPopover((prev) => !prev)}
                className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  config.isDoubleRow
                    ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="Çift Sıra (Sırt Sırta) İfraz Modu"
              >
                <div className="flex items-center gap-1.5">
                  <Columns className={`w-3.5 h-3.5 stroke-[2] ${config.isDoubleRow ? 'text-white' : 'text-purple-400'}`} />
                  <span className="text-[11px]">Çift Sıra</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                  config.isDoubleRow ? 'bg-purple-900 text-purple-200' : 'text-slate-500 bg-white/[0.03]'
                }`}>
                  {config.isDoubleRow ? 'AÇIK' : 'KAPALI'}
                </span>
              </button>

              {/* Çift Sıra Popover */}
              {showDoubleRowPopover && (
                <div className="absolute left-full top-0 ml-2 z-[1100] w-64 apple-glass rounded-2xl p-3 shadow-2xl border border-white/15 text-white space-y-2.5 animate-in fade-in slide-in-from-left-1 duration-150">
                  <label className="flex items-center justify-between text-xs font-medium text-slate-200 cursor-pointer">
                    <span>Çift Sıra Modu</span>
                    <input
                      type="checkbox"
                      checked={config.isDoubleRow}
                      onChange={(e) => handleConfigChange('isDoubleRow', e.target.checked)}
                      className="w-4 h-4 rounded-md accent-purple-500 cursor-pointer"
                    />
                  </label>
                  {config.isDoubleRow && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.08] text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Eksen Split Konumu:</span>
                        <span className="font-mono text-purple-300 font-bold">%{config.axisPosition}</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={config.axisPosition}
                        onChange={(e) => handleConfigChange('axisPosition', parseInt(e.target.value) || 50)}
                        className="w-full h-1.5 bg-white/10 rounded-full accent-purple-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-white/[0.08] my-1.5 mx-0.5" />

          {/* Grup 2: Yol Cephesi */}
          <div className="space-y-1">
            <div className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Yol Cephesi
            </div>

            {/* Yol Cephesi Seç Butonu */}
            <button
              onClick={onToggleSelectFrontageEdge}
              className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                isSelectingFrontageEdge
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30 border border-amber-400'
                  : selectedFrontageEdgeIndices.length > 0
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Haritadan parselin yol gören kenarlarını tıklayarak belirleyin"
            >
              <div className="flex items-center gap-1.5">
                <Navigation className={`w-3.5 h-3.5 stroke-[2] ${isSelectingFrontageEdge ? 'text-slate-950' : 'text-amber-400'}`} />
                <span className="text-[11px]">Yol Cephesi</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                isSelectingFrontageEdge
                  ? 'bg-amber-700 text-white'
                  : selectedFrontageEdgeIndices.length > 0
                  ? 'bg-amber-500/30 text-amber-200'
                  : 'text-slate-500 bg-white/[0.03]'
              }`}>
                {isSelectingFrontageEdge ? 'SEÇİLİYOR' : selectedFrontageEdgeIndices.length > 0 ? `${selectedFrontageEdgeIndices.length} Kırık` : 'SEÇ'}
              </span>
            </button>

            {/* Cephe Seçilmişse Bilgi Çipi */}
            {selectedFrontageEdgeIndices.length > 0 && (
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] space-y-1">
                <div className="flex items-center justify-between text-amber-300 font-semibold">
                  <span>Toplam: {multiFrontage.totalLengthM} m</span>
                  {onClearFrontage && (
                    <button
                      onClick={onClearFrontage}
                      className="text-slate-400 hover:text-rose-400 text-[10px] underline"
                      title="Cephe seçimini temizle"
                    >
                      Sıfırla
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  Dik Açı: <span className="text-amber-300 font-mono font-bold">{multiFrontage.perpAngle}°</span>
                </div>
              </div>
            )}

            {/* Zemin Türü Tahmini & Jeoteknik Analiz Butonu */}
            {onOpenSoilAnalysis && (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => onOpenSoilAnalysis('soil')}
                  className="h-8 px-2 rounded-xl text-xs font-semibold transition flex items-center justify-between active:scale-95 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 hover:border-amber-400 shadow-sm"
                  title="TBDY 2018 Zemin Sınıfları (ZA-ZF), Vs30, Taşıma Gücü ve Jeoteknik Raporu"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Mountain className="w-3.5 h-3.5 text-amber-400 stroke-[2] shrink-0" />
                    <span className="text-[11px] font-medium text-slate-100 truncate">Zemin (TBDY)</span>
                  </div>
                  <span className="text-[9px] px-1 py-0.5 rounded font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
                    ZA-ZF
                  </span>
                </button>

                <button
                  onClick={() => onOpenSoilAnalysis('slope')}
                  className="h-8 px-2 rounded-xl text-xs font-semibold transition flex items-center justify-between active:scale-95 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 hover:border-emerald-400 shadow-sm"
                  title="Topoğrafik Eğim, Kot Farkı, Açığa Çıkan Katlar ve Mekânsal Yerleşime Uygunluk Raporu"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 stroke-[2] shrink-0" />
                    <span className="text-[11px] font-medium text-slate-100 truncate">Eğim Raporu</span>
                  </div>
                  <span className="text-[9px] px-1 py-0.5 rounded font-mono font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                    UÖ/ÖA
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="h-px bg-white/[0.08] my-1.5 mx-0.5" />

          {/* Grup 3: Eylemler */}
          <div className="space-y-1">
            <div className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Eylemler
            </div>

            {/* İfrazı Hesapla / Çalıştır Butonu */}
            {onRecalculate && (
              <button
                onClick={onRecalculate}
                className="w-full h-8 px-2 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-between active:scale-95 shadow-[0_2px_12px_rgba(59,130,246,0.4)] border border-blue-400/30"
                title="İfraz hesaplamasını yeniden çalıştır"
              >
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="text-[11px]">İfrazı Hesapla</span>
                </div>
                <span className="text-[9px] bg-blue-700/80 px-1.5 py-0.5 rounded font-mono font-bold">
                  ÇALIŞTIR
                </span>
              </button>
            )}

            {/* Tevhit (Seçilileri Birleştir) Butonu */}
            <button
              onClick={onMergeSelected}
              disabled={selectedParcelIds.length < 2}
              className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                selectedParcelIds.length >= 2
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-md shadow-emerald-500/30'
                  : 'text-slate-500 bg-white/[0.02] cursor-not-allowed opacity-60'
              }`}
              title={selectedParcelIds.length >= 2 ? 'Seçili parselleri birleştir (Tevhid)' : 'Birleştirmek için haritadan en az 2 parsel seçin'}
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 stroke-[2]" />
                <span className="text-[11px]">Tevhit Et</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                selectedParcelIds.length >= 2 ? 'bg-emerald-700 text-white' : 'text-slate-500'
              }`}>
                {selectedParcelIds.length >= 2 ? `${selectedParcelIds.length} Parsel` : '0'}
              </span>
            </button>

            {/* Sıfırla Butonu */}
            <button
              onClick={onReset}
              className="w-full h-8 px-2 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition flex items-center justify-between active:scale-95"
              title="Tüm parselleri ve çizimleri sıfırla"
            >
              <div className="flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                <span className="text-[11px]">Sıfırla</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
