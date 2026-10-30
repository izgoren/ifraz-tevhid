import React, { useState } from 'react';
import {
  Undo,
  Redo,
  FolderOpen,
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
  MousePointerClick,
  Sun,
  Moon,
  Sliders,
  Save,
  RotateCcw
} from 'lucide-react';
import type { Feature, LineString } from 'geojson';
import { GeneratedParcel, MapSettings, StatsSummary, SubdivisionConfig } from '../types';
import { ParcelEdge, calculateMultiEdgeFrontage } from '../utils/geometryOptimizer';

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
  selectedFrontageEdgeIndices?: number[];
  isSelectingFrontageEdge?: boolean;
  onToggleSelectFrontageEdge?: () => void;
  onToggleFrontageEdge?: (edgeIndex: number) => void;
  onClearFrontage?: () => void;
  onSaveSettings?: () => void;
  onResetSettings?: () => void;
  isSettingsSaved?: boolean;
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
  selectedFrontageEdgeIndices = [],
  isSelectingFrontageEdge = false,
  onToggleSelectFrontageEdge,
  onToggleFrontageEdge,
  onClearFrontage,
  onSaveSettings,
  onResetSettings,
  isSettingsSaved = false
}) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'params' | 'layers' | 'settings'>('params');

  const handleConfigChange = <K extends keyof SubdivisionConfig>(key: K, value: SubdivisionConfig[K]) => {
    onChangeConfig({ ...config, [key]: value });
  };

  const handleSettingChange = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => {
    onChangeMapSettings({ ...mapSettings, [key]: value });
  };

  // Multi-edge road frontage calculation
  const multiFrontage = calculateMultiEdgeFrontage(mainPolygonEdges, selectedFrontageEdgeIndices);

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

        {/* Kadastro Dosyası Aç (KML / GeoJSON) Klasör Simgesi */}
        <label
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/15 cursor-pointer transition text-amber-400 hover:text-amber-300"
          title="Kadastro Dosyası Aç (KML / GeoJSON)"
        >
          <FolderOpen className="w-3.5 h-3.5 stroke-[1.75]" />
          <input
            type="file"
            accept=".kml,.geojson,.json"
            onChange={onKMLUpload}
            className="hidden"
          />
        </label>

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
                { id: 'params', label: 'İFRAZ', icon: Scissors },
                { id: 'layers', label: 'Katman', icon: Layers },
                { id: 'settings', label: 'Ayarlar', icon: Sliders }
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg transition tracking-tight flex items-center justify-center gap-1 ${
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
                      {config.pieceCount === 0 ? '0 Parsel (İfrazsız)' : `${config.pieceCount} Parsel`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={60}
                      value={config.pieceCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        handleConfigChange('pieceCount', Number.isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      className="w-full h-1 bg-white/10 rounded-full accent-blue-500 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.pieceCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        handleConfigChange('pieceCount', Number.isNaN(val) ? 0 : Math.max(0, val));
                      }}
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

                {/* ================= YOL CEPHESİ SEÇ (ÇOKLU KIRIK) ================= */}
                <div className="apple-card p-3.5 space-y-3 border border-amber-500/20 bg-amber-500/[0.02]">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white tracking-tight">
                      <Navigation className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />
                      <span>Yol Cephesi (Çoklu Kırık)</span>
                    </div>
                    {selectedFrontageEdgeIndices.length > 0 && onClearFrontage && (
                      <button
                        onClick={onClearFrontage}
                        className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-0.5 transition"
                        title="Seçili tüm cephe kırıklarını sıfırla"
                      >
                        <X className="w-3 h-3" />
                        <span>Sıfırla</span>
                      </button>
                    )}
                  </div>

                  {/* Tek Ana Seçim Butonu: Haritadan Yol Cephesi Seç */}
                  <button
                    onClick={onToggleSelectFrontageEdge}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-[0.98] border ${
                      isSelectingFrontageEdge
                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-[0_2px_14px_rgba(245,158,11,0.5)]'
                        : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border-white/[0.08]'
                    }`}
                    title="Harita üzerinden veya aşağıdaki listeden çoklu kenar seçin"
                  >
                    <MousePointerClick className="w-4 h-4 stroke-[2]" />
                    <span>
                      {isSelectingFrontageEdge
                        ? 'Haritada Kenarlara Tıklayın (Seçim Aktif)'
                        : 'Haritadan Yol Cephesi Seç'}
                    </span>
                  </button>

                  {/* Çoklu Kırık Cephe Durum Kartı */}
                  {selectedFrontageEdgeIndices.length > 0 ? (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-amber-300 font-medium">
                        <span className="flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                          Toplam Yol Cephesi:
                        </span>
                        <span className="font-mono text-white font-bold text-sm">
                          {multiFrontage.totalLengthM} m
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-300">
                        <span>Seçili Kırık Kenar:</span>
                        <span className="font-mono text-amber-300 font-semibold">
                          {selectedFrontageEdgeIndices.length} Adet (
                          {selectedFrontageEdgeIndices.map((idx) => `#${idx + 1}`).join(', ')})
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-tight">
                        İfraz kesim açısı çoklu kırık doğrultusuna dik olarak{' '}
                        <span className="text-amber-300 font-mono font-bold">
                          {multiFrontage.perpAngle}°
                        </span>{' '}
                        ayarlandı.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Butona basarak harita üzerinden veya aşağıdaki listeden parselin yol gören kırık kenarlarını (tek veya çoklu) seçebilirsiniz.
                    </p>
                  )}

                  {/* Parsel Kenarlarından Çoklu Kırık Seçim Listesi (Chips) */}
                  {mainPolygonEdges.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                      <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                        <span>Kırık Kenar Listesi:</span>
                        <span>{selectedFrontageEdgeIndices.length}/{mainPolygonEdges.length} Seçili</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                        {mainPolygonEdges.map((edge) => {
                          const isCurrent = selectedFrontageEdgeIndices.includes(edge.index);
                          return (
                            <button
                              key={edge.index}
                              onClick={() => onToggleFrontageEdge && onToggleFrontageEdge(edge.index)}
                              className={`py-1.5 px-2 rounded-lg text-[10px] text-left transition flex items-center justify-between border ${
                                isCurrent
                                  ? 'bg-amber-500/25 border-amber-500/50 text-amber-200 font-bold shadow-sm'
                                  : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06] text-slate-300'
                              }`}
                              title={`Kenar #${edge.index + 1} (${edge.lengthM}m) - ${isCurrent ? 'Çıkar' : 'Ekle'}`}
                            >
                              <span className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-amber-400' : 'bg-slate-500'}`} />
                                Kenar #{edge.index + 1}
                              </span>
                              <span className="font-mono text-slate-300 font-medium">{edge.lengthM}m</span>
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

            {/* ================= SEKMELER 3: AYARLAR (GECE/GÜNDÜZ, SAYDAMLIK, AYARLARI SAKLA) ================= */}
            {activeTab === 'settings' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* 1. Görünüm & Tema: Gece / Gündüz */}
                <div className="apple-card p-3.5 space-y-2.5">
                  <label className="text-[11px] font-semibold text-slate-300 tracking-tight block">
                    Görünüm & Tema
                  </label>
                  <div className="bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => handleSettingChange('theme', 'dark')}
                      className={`py-2 px-3 rounded-lg text-center transition text-xs font-medium flex items-center justify-center gap-1.5 ${
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
                      className={`py-2 px-3 rounded-lg text-center transition text-xs font-medium flex items-center justify-center gap-1.5 ${
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

                {/* 2. Saydamlık Kontrolleri */}
                <div className="apple-card p-3.5 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 tracking-tight flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
                      <span>Saydamlık Ayarları</span>
                    </label>
                  </div>

                  {/* Menü & Panel Saydamlığı */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Menü & Panel Saydamlığı:</span>
                      <span className="text-xs font-mono font-semibold text-blue-400">
                        %{mapSettings.uiOpacity ?? 78}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={35}
                      max={100}
                      value={mapSettings.uiOpacity ?? 78}
                      onChange={(e) => handleSettingChange('uiOpacity', parseInt(e.target.value) || 78)}
                      className="w-full h-1 bg-white/10 rounded-full accent-blue-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span>Çok Saydam (Cam)</span>
                      <span>Standart (%78)</span>
                      <span>Mat / Opak</span>
                    </div>
                  </div>

                  {/* Parsel Dolgu Saydamlığı (CAD Araçlarına Taşındı) */}
                  <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-300">
                    <span>Parsel Dolgu Saydamlığı:</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium border border-emerald-500/20">
                      Sağ CAD Menüsünde
                    </span>
                  </div>
                </div>

                {/* 3. Ayarlarımı Sakla */}
                <div className="apple-card p-3.5 space-y-2.5">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-white block">Kullanıcı Tercihleri</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Tema, saydamlık ve sistem tercihlerinizi tarayıcınıza kaydedin. Sayfayı yeniden açtığınızda tercihleriniz otomatik olarak korunur.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      onClick={onSaveSettings}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium py-2 px-3 rounded-xl flex items-center justify-center gap-2 shadow-[0_2px_12px_rgba(16,185,129,0.35)] transition active:scale-[0.98]"
                    >
                      <Save className="w-4 h-4 stroke-[2]" />
                      <span className="text-xs font-semibold">Ayarlarımı Sakla</span>
                    </button>

                    {isSettingsSaved && (
                      <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] text-center font-medium animate-in fade-in duration-200">
                        ✓ Ayarlarınız başarıyla saklandı!
                      </div>
                    )}

                    <button
                      onClick={onResetSettings}
                      className="w-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-white/[0.06] transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5 stroke-[1.75]" />
                      <span>Varsayılan Ayarlara Dön</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
