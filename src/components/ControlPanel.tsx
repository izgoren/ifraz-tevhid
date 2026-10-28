import React, { useState } from 'react';
import {
  Undo,
  Redo,
  Upload,
  Layers,
  Scissors,
  Download,
  Settings2,
  ChevronLeft,
  FileSpreadsheet,
  Info,
  Compass,
  Crosshair,
  Ruler,
  Check,
  Printer,
  Sparkles,
  Navigation,
  RefreshCw,
  PenTool,
  X,
  MousePointerClick
} from 'lucide-react';
import type { Feature, LineString } from 'geojson';
import { GeneratedParcel, MapSettings, StatsSummary, SubdivisionConfig } from '../types';
import { ParcelEdge } from '../utils/geometryOptimizer';

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
  onUpdateParcelAttributes: (parcelId: string, updatedFields: Partial<GeneratedParcel>) => void;
  statusMessage: string;
  onOpenPrintModal?: () => void;
  onRecalculate?: () => void;
  roadLines?: Feature<LineString>[];
  mainPolygonEdges?: ParcelEdge[];
  selectedFrontageEdgeIndex?: number | null;
  isDrawingRoadFrontage?: boolean;
  isSelectingFrontageEdge?: boolean;
  onToggleDrawRoadFrontage?: () => void;
  onToggleSelectFrontageEdge?: () => void;
  onSelectFrontageEdge?: (edgeIndex: number) => void;
  onClearFrontage?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  onChangeConfig,
  mapSettings,
  onChangeMapSettings,
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
  statusMessage,
  onOpenPrintModal,
  onRecalculate,
  roadLines = [],
  mainPolygonEdges = [],
  selectedFrontageEdgeIndex = null,
  isDrawingRoadFrontage = false,
  isSelectingFrontageEdge = false,
  onToggleDrawRoadFrontage,
  onToggleSelectFrontageEdge,
  onSelectFrontageEdge,
  onClearFrontage
}) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'layers' | 'params' | 'cad'>('params');

  const handleConfigChange = <K extends keyof SubdivisionConfig>(key: K, value: SubdivisionConfig[K]) => {
    onChangeConfig({ ...config, [key]: value });
  };

  const handleSettingChange = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => {
    onChangeMapSettings({ ...mapSettings, [key]: value });
  };

  const selectedEdge = selectedFrontageEdgeIndex !== null
    ? mainPolygonEdges.find((e) => e.index === selectedFrontageEdgeIndex)
    : null;

  return (
    <>
      {/* Apple Dynamic Island Floating Action Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] h-11 px-3.5 apple-glass rounded-full flex items-center gap-2 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-all animate-in fade-in slide-in-from-top-2 duration-200">
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

        <div className="h-3.5 w-px bg-white/15 mx-0.5" />

        <div className="flex items-center gap-2 px-1 text-xs font-medium tracking-tight text-slate-200">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span>İfraz & Tevhid</span>
        </div>

        <div className="h-3.5 w-px bg-white/15 mx-0.5" />

        {/* Yazdır Butonu */}
        {onOpenPrintModal && (
          <button
            onClick={onOpenPrintModal}
            className="h-8 px-3.5 bg-white/10 hover:bg-white/15 active:bg-white/20 text-white text-xs font-medium rounded-full flex items-center gap-1.5 transition active:scale-95 border border-white/10 shadow-sm"
            title="İfraz ve Tevhid Uygulama Krokisi Yazıcı Çıktısı Al"
          >
            <Printer className="w-3.5 h-3.5 text-slate-300 stroke-[1.75]" />
            <span>Yazdır</span>
          </button>
        )}

        {/* BÜYÜK İFRAZ BUTONU */}
        {onRecalculate && (
          <button
            onClick={onRecalculate}
            className="h-8 px-4 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white text-xs font-bold tracking-wider rounded-full flex items-center gap-1.5 transition active:scale-95 shadow-[0_2px_14px_rgba(59,130,246,0.5)] border border-blue-400/30"
            title="İfraz hesaplamasını yeniden çalıştır ve parselleri oluştur"
          >
            <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="text-xs uppercase font-extrabold tracking-wider">İFRAZ</span>
          </button>
        )}

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

      {/* Left Panel Toggle Button when Collapsed */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 left-4 z-[1000] h-10 px-4 apple-glass text-white font-medium text-xs rounded-full flex items-center gap-2 transition active:scale-95 hover:bg-slate-900/90 shadow-lg"
          title="Menüyü Aç"
        >
          <Layers className="w-4 h-4 text-blue-400 stroke-[1.75]" />
          <span>Katmanlar & İFRAZ</span>
        </button>
      )}

      {/* Unified Left Floating Panel: Katmanlar, İFRAZ ve CAD */}
      {panelOpen && (
        <div className="absolute top-4 left-4 z-[1000] w-88 max-h-[calc(100vh-2rem)] flex flex-col apple-glass rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-left-2">
          {/* Header & Apple Segmented Control */}
          <div className="h-12 px-3 border-b border-white/[0.08] flex items-center justify-between shrink-0 gap-1.5">
            <div className="bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] flex items-center gap-0.5 flex-1">
              {[
                { id: 'layers', label: 'Katmanlar', icon: Layers },
                { id: 'params', label: 'İFRAZ', icon: Settings2 },
                { id: 'cad', label: 'CAD', icon: Crosshair }
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg transition tracking-tight flex items-center justify-center gap-1.5 ${
                      isActive
                        ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <IconComponent className={`w-3.5 h-3.5 stroke-[1.75] ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className={tab.id === 'params' ? 'font-bold uppercase tracking-wider' : ''}>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPanelOpen(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
              title="Paneli Kapat"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
            {/* ================= SEKMELER 1: KATMANLAR & DOSYA ================= */}
            {activeTab === 'layers' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Altlık Harita Seçimi (Apple Segmented Control) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300 tracking-tight block">Altlık Harita</label>
                  <div className="bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] grid grid-cols-2 gap-1">
                    {[
                      { id: 'googleHybrid', label: 'Hibrit Uydu' },
                      { id: 'googleSatellite', label: 'Saf Uydu' }
                    ].map((item) => {
                      const isActive = mapSettings.tileProvider === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSettingChange('tileProvider', item.id as any)}
                          className={`py-1.5 px-2.5 rounded-lg text-center transition text-xs font-medium flex items-center justify-center gap-1.5 ${
                            isActive
                              ? 'bg-white/15 text-white shadow-sm border border-white/10 font-semibold'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                          }`}
                        >
                          <span>{item.label}</span>
                          {isActive && <Check className="w-3 h-3 text-blue-400 stroke-[2.5]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Görsel Katman Ayarları */}
                <div className="space-y-2 pt-3 border-t border-white/[0.08]">
                  <label className="text-[11px] font-semibold text-slate-300 tracking-tight block">Görünürlük</label>
                  <div className="apple-card p-2 space-y-1">
                    {[
                      { key: 'showFill', label: 'Parsel Dolguları' },
                      { key: 'showNames', label: 'Parsel Numaraları' },
                      { key: 'showAreas', label: 'Parsel Alanları (m²)' },
                      { key: 'showEdgeLengths', label: 'Kenar Ölçüleri (m)' }
                    ].map((opt) => {
                      const isChecked = (mapSettings as any)[opt.key];
                      return (
                        <label key={opt.key} className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition">
                          <span className="text-[11px] font-medium">{opt.label}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleSettingChange(opt.key as any, e.target.checked)}
                            className="w-4 h-4 rounded-md accent-blue-500 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Kadastro Dosyası Yükleme */}
                <div className="pt-3 border-t border-white/[0.08] space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300 tracking-tight block">Kadastro Dosyası</label>
                  <label className="w-full flex items-center justify-center gap-2 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-dashed border-white/15 rounded-xl cursor-pointer text-slate-300 hover:text-white transition group">
                    <Upload className="w-4 h-4 text-blue-400 stroke-[1.75] group-hover:scale-105 transition-transform" />
                    <span className="font-medium text-xs">KML veya GeoJSON Seç</span>
                    <input type="file" accept=".kml,.geojson,.json" onChange={onKMLUpload} className="hidden" />
                  </label>
                </div>

                {/* Dışa Aktarma Butonları */}
                <div className="pt-3 border-t border-white/[0.08] space-y-2">
                  <label className="text-[11px] font-semibold text-slate-300 tracking-tight block">Dışa Aktar & Rapor</label>
                  <div className="flex flex-col gap-1.5">
                    {onOpenPrintModal && (
                      <button
                        onClick={onOpenPrintModal}
                        className="w-full bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-medium py-2 px-3 rounded-xl flex items-center justify-between shadow-[0_2px_12px_rgba(59,130,246,0.35)] transition active:scale-[0.98]"
                      >
                        <span className="flex items-center gap-2 text-xs">
                          <Printer className="w-3.5 h-3.5 text-blue-100 stroke-[2]" />
                          Uygulama Krokisi Çıktısı (A4)
                        </span>
                        <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">PDF</span>
                      </button>
                    )}
                    <button
                      onClick={onExportKML}
                      className="w-full bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.1] text-slate-200 text-xs py-2 px-3 rounded-xl flex items-center justify-between border border-white/[0.06] transition active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />
                        Google Earth KML
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">.kml</span>
                    </button>
                    <button
                      onClick={onExportGeoJSON}
                      className="w-full bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.1] text-slate-200 text-xs py-2 px-3 rounded-xl flex items-center justify-between border border-white/[0.06] transition active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                        CBS GeoJSON
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">.geojson</span>
                    </button>
                    <button
                      onClick={onExportCSV}
                      className="w-full bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.1] text-slate-200 text-xs py-2 px-3 rounded-xl flex items-center justify-between border border-white/[0.06] transition active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                        Koordinat Tablosu
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">.csv</span>
                    </button>
                  </div>
                </div>

                {/* Sistem Durumu */}
                <div className="pt-3 border-t border-white/[0.08]">
                  <div className="apple-card p-2.5 text-[11px] text-slate-400 leading-relaxed space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                      <Info className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                      <span>Bilgi</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{statusMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ================= SEKMELER 2: İFRAZ AYARLARI ================= */}
            {activeTab === 'params' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Parça Sayısı & Kesim Açısı */}
                <div className="apple-card p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300 tracking-tight">Parça Sayısı</label>
                    <span className="text-xs font-semibold text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                      {config.pieceCount} Parsel
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2}
                      max={60}
                      value={config.pieceCount}
                      onChange={(e) => handleConfigChange('pieceCount', parseInt(e.target.value) || 2)}
                      className="w-full h-1 bg-white/10 rounded-full accent-blue-500 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={2}
                      max={100}
                      value={config.pieceCount}
                      onChange={(e) => handleConfigChange('pieceCount', parseInt(e.target.value) || 2)}
                      className="w-14 bg-white/[0.04] border border-white/[0.08] text-xs text-center text-white rounded-lg p-1 font-mono outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-300 tracking-tight">Kesim Açısı</label>
                      <span className="text-xs font-mono font-medium text-amber-400">{config.rotateAngle}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={180}
                      value={config.rotateAngle}
                      onChange={(e) => handleConfigChange('rotateAngle', parseFloat(e.target.value) || 0)}
                      className="w-full h-1 bg-white/10 rounded-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Double Row (Çift Sıra / Sırt Sırta) Controls */}
                <div className="apple-card p-3.5 space-y-3">
                  <label className="flex items-center justify-between text-xs font-medium text-slate-200 cursor-pointer">
                    <span>Çift Sıra İfraz (Sırt Sırta)</span>
                    <input
                      type="checkbox"
                      checked={config.isDoubleRow}
                      onChange={(e) => handleConfigChange('isDoubleRow', e.target.checked)}
                      className="w-4 h-4 rounded-md accent-blue-500 cursor-pointer"
                    />
                  </label>

                  {config.isDoubleRow && (
                    <div className="space-y-3 pt-2 border-t border-white/[0.08] text-xs">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[11px] text-slate-400">Eksen Split Konumu:</span>
                          <span className="font-medium text-slate-200">%{config.axisPosition}</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={90}
                          value={config.axisPosition}
                          onChange={(e) => handleConfigChange('axisPosition', parseInt(e.target.value) || 50)}
                          className="w-full h-1 bg-white/10 rounded-full accent-blue-500 cursor-pointer"
                        />
                      </div>

                      <label className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer pt-1">
                        <span className="text-[11px]">Sıra Eğilimlerini Ayrı Kullan</span>
                        <input
                          type="checkbox"
                          checked={config.isSplitAngles}
                          onChange={(e) => handleConfigChange('isSplitAngles', e.target.checked)}
                          className="w-4 h-4 rounded-md accent-blue-500 cursor-pointer"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* ================= YENİ: YOL CEPHESİ ÇİZ VE SEÇ ÖZELLİĞİ ================= */}
                <div className="apple-card p-3.5 space-y-3 border border-amber-500/20 bg-amber-500/[0.02]">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white tracking-tight">
                      <Navigation className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />
                      <span>Yol Cephesi (Çiz & Seç)</span>
                    </div>
                    {(selectedFrontageEdgeIndex !== null || roadLines.length > 0) && onClearFrontage && (
                      <button
                        onClick={onClearFrontage}
                        className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-0.5 transition"
                        title="Seçili yol cephesini sıfırla"
                      >
                        <X className="w-3 h-3" />
                        <span>Sıfırla</span>
                      </button>
                    )}
                  </div>

                  {/* İki Ana İşlem Butonu: ÇİZ ve SEÇ */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* 1. Yol Cephesi Çiz Butonu */}
                    <button
                      onClick={onToggleDrawRoadFrontage}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition active:scale-[0.98] border ${
                        isDrawingRoadFrontage
                          ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-[0_2px_12px_rgba(245,158,11,0.4)]'
                          : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border-white/[0.08]'
                      }`}
                      title="Harita üzerine çizgi çizerek yol cephesini belirleyin"
                    >
                      <PenTool className="w-3.5 h-3.5 stroke-[2]" />
                      <span>{isDrawingRoadFrontage ? 'Çizim Aktif' : 'Yol Cephesi Çiz'}</span>
                    </button>

                    {/* 2. Yol Cephesi Seç Butonu */}
                    <button
                      onClick={onToggleSelectFrontageEdge}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition active:scale-[0.98] border ${
                        isSelectingFrontageEdge
                          ? 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow-[0_2px_12px_rgba(56,189,248,0.4)]'
                          : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border-white/[0.08]'
                      }`}
                      title="Parsel kenarlarından birine tıklayarak yol cephesi seçin"
                    >
                      <MousePointerClick className="w-3.5 h-3.5 stroke-[2]" />
                      <span>{isSelectingFrontageEdge ? 'Kenara Tıkla' : 'Yol Cephesi Seç'}</span>
                    </button>
                  </div>

                  {/* Aktif Cephe Durum Bilgisi */}
                  {selectedEdge ? (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-amber-300 font-medium">
                        <span className="flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                          Kenar #{selectedEdge.index + 1} Seçili
                        </span>
                        <span className="font-mono text-white font-semibold">{selectedEdge.lengthM} metre</span>
                      </div>
                      <p className="text-[10px] text-slate-300">
                        İfraz kesim açısı cepheye tam dik olarak <span className="text-amber-300 font-mono font-bold">{selectedEdge.perpAngle}°</span> ayarlandı.
                      </p>
                    </div>
                  ) : roadLines.length > 0 ? (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-amber-300 font-medium">
                        <span className="flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                          Çizilen Yol Cephesi Aktif
                        </span>
                        <span className="font-mono text-white font-semibold">{roadLines.length} Çizgi</span>
                      </div>
                      <p className="text-[10px] text-slate-300">
                        İfraz açısı çizilen yol hattına dik açıyla hizalandı.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Butona tıklayarak yol cephesini serbestçe çizebilir veya parsel sınırlarından birine tıklayarak cephe olarak seçebilirsiniz.
                    </p>
                  )}

                  {/* Parsel Kenarlarından Hızlı Seçim Listesi (Chips) */}
                  {mainPolygonEdges.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-white/[0.06]">
                      <span className="text-[10px] font-medium text-slate-400 block">Parsel Kenarlarından Seç:</span>
                      <div className="grid grid-cols-2 gap-1 max-h-28 overflow-y-auto pr-0.5">
                        {mainPolygonEdges.map((edge) => {
                          const isCurrent = selectedFrontageEdgeIndex === edge.index;
                          return (
                            <button
                              key={edge.index}
                              onClick={() => onSelectFrontageEdge && onSelectFrontageEdge(edge.index)}
                              className={`py-1 px-2 rounded-lg text-[10px] text-left transition flex items-center justify-between border ${
                                isCurrent
                                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold'
                                  : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.05] text-slate-300'
                              }`}
                            >
                              <span>Kenar #{edge.index + 1}</span>
                              <span className="font-mono text-slate-400">{edge.lengthM}m</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* BÜYÜK İFRAZ HESAPLA / UYGULA BUTONU */}
                {onRecalculate && (
                  <button
                    onClick={onRecalculate}
                    className="w-full h-10 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white text-xs font-bold tracking-wider uppercase rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(59,130,246,0.35)] transition active:scale-[0.98] border border-blue-400/30"
                  >
                    <RefreshCw className="w-4 h-4 stroke-[2.5]" />
                    <span className="text-xs uppercase font-extrabold tracking-wider">İFRAZ HESAPLA & UYGULA</span>
                  </button>
                )}
              </div>
            )}

            {/* ================= SEKMELER 3: CAD DÜZENLEME ================= */}
            {activeTab === 'cad' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* CAD Mode Toggle */}
                <div className="apple-card p-3.5 space-y-2.5">
                  <label className="flex items-center justify-between text-xs font-semibold text-white cursor-pointer">
                    <span className="flex items-center gap-1.5">
                      <Crosshair className="w-4 h-4 text-emerald-400 stroke-[2]" />
                      CAD Düzenleme Modu
                    </span>
                    <input
                      type="checkbox"
                      checked={mapSettings.cadModeActive}
                      onChange={(e) => handleSettingChange('cadModeActive', e.target.checked)}
                      className="w-4 h-4 rounded-md accent-emerald-500 cursor-pointer"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    CAD modunu açarak ifraz parsellerinin köşe noktalarını (vertex) fareyle sürükleyebilir, yeni köşe ekleyebilir veya bıçak çizgisi çizerek serbestçe ifraz edebilirsiniz.
                  </p>
                </div>

                {/* CAD Tool Selector */}
                {mapSettings.cadModeActive && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 tracking-tight block">Aktif CAD Aracı</label>
                    <div className="bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] grid grid-cols-2 gap-1">
                      <button
                        onClick={() => handleSettingChange('cadActiveTool', 'vertex')}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition ${
                          mapSettings.cadActiveTool === 'vertex'
                            ? 'bg-white/15 text-white shadow-sm border border-white/10 font-semibold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                        }`}
                      >
                        <Crosshair className="w-4 h-4 text-emerald-400 stroke-[2]" />
                        <span className="text-[11px]">Köşe Taşı</span>
                      </button>

                      <button
                        onClick={() => handleSettingChange('cadActiveTool', 'slice')}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition ${
                          mapSettings.cadActiveTool === 'slice'
                            ? 'bg-white/15 text-white shadow-sm border border-white/10 font-semibold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                        }`}
                      >
                        <Scissors className="w-4 h-4 text-rose-400 stroke-[2]" />
                        <span className="text-[11px]">CAD Bıçağı</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* CAD Kullanım Talimatları */}
                <div className="apple-card p-3 space-y-2 text-[11px] text-slate-300">
                  <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
                    <Ruler className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                    <span>CAD Kılavuzu</span>
                  </div>
                  <ul className="space-y-1 text-[10px] text-slate-400 list-disc list-inside">
                    <li><b className="text-slate-200">Köşe Taşıma:</b> Beyaz noktalardan tutarak sınırları kaydırın.</li>
                    <li><b className="text-slate-200">Yeni Kırık Ekleme:</b> Kenar ortasındaki soluk noktaları çekin.</li>
                    <li><b className="text-slate-200">CAD Bıçağı:</b> Parselin üzerinden geçen çizgi çizerek bölün.</li>
                    <li><b className="text-slate-200">Mıknatıslanma:</b> Komşu sınırlara otomatik kenetlenir.</li>
                  </ul>
                </div>

                {/* Drag-to-Merge (Tevhid) Enable */}
                <div className="apple-card p-3 space-y-1.5">
                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="font-medium">Sürükle-Bırak Tevhit</span>
                    <input
                      type="checkbox"
                      checked={mapSettings.enableDragMerge}
                      onChange={(e) => handleSettingChange('enableDragMerge', e.target.checked)}
                      className="w-4 h-4 rounded-md accent-blue-500 cursor-pointer"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400">
                    Bir parseli diğerinin üzerine sürükleyerek anında birleştirebilirsiniz.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
