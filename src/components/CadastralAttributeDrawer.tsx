import React, { useState, useMemo } from 'react';
import {
  TableProperties,
  X,
  Search,
  Download,
  FolderPlus,
  CheckCircle2,
  Trash2,
  Maximize,
  Minimize2,
  Maximize2,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MapPin,
  FileCode,
  Info,
  Mountain,
  TrendingUp
} from 'lucide-react';
import { LoadedCadastralFile, LoadedCadastralParcel } from '../types';
import { exportLoadedParcelsToKML, triggerFileDownload } from '../utils/kmlExporter';

interface CadastralAttributeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  loadedFiles: LoadedCadastralFile[];
  activeParcelId?: string;
  onSelectActiveParcel: (parcel: LoadedCadastralParcel) => void;
  onZoomToParcel?: (parcel: LoadedCadastralParcel) => void;
  onRemoveFile?: (fileId: string) => void;
  onRemoveParcel?: (parcelId: string) => void;
  onMergeParcels?: (parcels: LoadedCadastralParcel[]) => void;
  onUploadAdditionalKML?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSoilAnalysis?: (parcel: LoadedCadastralParcel, tab?: 'soil' | 'slope') => void;
}

export const CadastralAttributeDrawer: React.FC<CadastralAttributeDrawerProps> = ({
  isOpen,
  onClose,
  loadedFiles,
  activeParcelId,
  onSelectActiveParcel,
  onZoomToParcel,
  onRemoveFile,
  onRemoveParcel,
  onMergeParcels,
  onUploadAdditionalKML,
  onOpenSoilAnalysis
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFileFilter, setSelectedFileFilter] = useState<string>('all');
  const [expandedParcelId, setExpandedParcelId] = useState<string | null>(null);
  const [selectedForMergeIds, setSelectedForMergeIds] = useState<string[]>([]);
  const [drawerSize, setDrawerSize] = useState<'full' | 'compact' | 'minimized'>('full');

  // Flatten all parcels from all loaded files
  const allParcels = useMemo(() => {
    return loadedFiles.flatMap((f) => f.parcels);
  }, [loadedFiles]);

  // Filtered parcels
  const filteredParcels = useMemo(() => {
    return allParcels.filter((p) => {
      if (selectedFileFilter !== 'all' && p.fileId !== selectedFileFilter) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const ada = (p.cadastralInfo.adaNo || '').toLowerCase();
      const parsel = (p.cadastralInfo.parselNo || '').toLowerCase();
      const mahalle = (p.cadastralInfo.mahalle || '').toLowerCase();
      const il = (p.cadastralInfo.il || '').toLowerCase();
      const ilce = (p.cadastralInfo.ilce || '').toLowerCase();
      const fileName = (p.fileName || '').toLowerCase();
      const name = (p.name || '').toLowerCase();

      return (
        ada.includes(term) ||
        parsel.includes(term) ||
        mahalle.includes(term) ||
        il.includes(term) ||
        ilce.includes(term) ||
        fileName.includes(term) ||
        name.includes(term)
      );
    });
  }, [allParcels, selectedFileFilter, searchTerm]);

  // Total Statistics
  const totalStats = useMemo(() => {
    const totalArea = allParcels.reduce((sum, p) => sum + p.areaM2, 0);
    return {
      fileCount: loadedFiles.length,
      parcelCount: allParcels.length,
      totalAreaM2: totalArea,
      totalAreaHa: totalArea / 10000
    };
  }, [loadedFiles, allParcels]);

  // Export Attributes Table as CSV
  const handleExportCSV = () => {
    if (allParcels.length === 0) return;
    const headers = [
      'Sıra',
      'Dosya Adı',
      'İl',
      'İlçe',
      'Mahalle',
      'Ada No',
      'Parsel No',
      'Mevkii',
      'Nitelik',
      'Hesaplanan Alan (m2)',
      'Tapu Alanı (m2)',
      'Zemin Sınıfı (TBDY 2018)',
      'Vs30 (m/s)',
      'Taşıma Gücü qa (kg/cm2)',
      'Sıvılaşma Riski',
      'Aktif Çalışma Parseli'
    ];

    const rows = allParcels.map((p, idx) => {
      const s = p.soilClassification;
      return [
        idx + 1,
        `"${p.fileName}"`,
        `"${p.cadastralInfo.il}"`,
        `"${p.cadastralInfo.ilce}"`,
        `"${p.cadastralInfo.mahalle}"`,
        `"${p.cadastralInfo.adaNo}"`,
        `"${p.cadastralInfo.parselNo}"`,
        `"${p.cadastralInfo.mevkii || ''}"`,
        `"${p.cadastralInfo.nitelik || ''}"`,
        p.areaM2.toFixed(2),
        p.cadastralInfo.tapuAlaniM2?.toFixed(2) || '',
        `"${s?.soilClass || 'ZC'}"`,
        s?.vs30 || '',
        s?.bearingCapacityKgCm2 || '',
        `"${s?.liquefactionRisk || 'Yok'}"`,
        p.id === activeParcelId ? 'EVET' : 'HAYIR'
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    triggerFileDownload(csvContent, 'Yuklenen_Kadastro_Oznitelik_Tablosu.csv', 'text/csv;charset=utf-8;');
  };

  // Export Attributes & Geometries as KML (Selected or Filtered or All)
  const handleExportKML = () => {
    const targetParcels =
      selectedForMergeIds.length > 0
        ? allParcels.filter((p) => selectedForMergeIds.includes(p.id))
        : filteredParcels;

    if (targetParcels.length === 0) return;

    const sanitizeFilePart = (str: string) =>
      str
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Kadastro';

    let fileName = 'Kadastro_Oznitelik_Verileri.kml';
    let docTitle = 'Kadastro Öznitelik Verileri';

    if (selectedForMergeIds.length > 0) {
      fileName = `Secili_Oznitelik_Parselleri_${targetParcels.length}.kml`;
      docTitle = `Seçili Kadastro Parselleri (${targetParcels.length})`;
    } else if (selectedFileFilter !== 'all') {
      const matchedFile = loadedFiles.find((f) => f.id === selectedFileFilter);
      if (matchedFile) {
        fileName = `${sanitizeFilePart(matchedFile.fileName)}_Oznitelik.kml`;
        docTitle = matchedFile.fileName;
      }
    }

    const kmlContent = exportLoadedParcelsToKML(targetParcels, docTitle);
    triggerFileDownload(kmlContent, fileName, 'application/vnd.google-earth.kml+xml;charset=utf-8;');
  };

  // Export Single Parcel with its Attributes as KML
  const handleExportSingleParcelKML = (parcel: LoadedCadastralParcel) => {
    const sanitize = (str: string) =>
      str.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Parsel';
    const ada = parcel.cadastralInfo.adaNo || '0';
    const parselNo = parcel.cadastralInfo.parselNo || parcel.name || '0';
    const fileName = `Ada_${sanitize(ada)}_Parsel_${sanitize(parselNo)}.kml`;
    const kmlContent = exportLoadedParcelsToKML([parcel], `Ada ${ada} / Parsel ${parselNo}`);
    triggerFileDownload(kmlContent, fileName, 'application/vnd.google-earth.kml+xml;charset=utf-8;');
  };

  const handleToggleMergeSelect = (parcelId: string) => {
    setSelectedForMergeIds((prev) =>
      prev.includes(parcelId) ? prev.filter((id) => id !== parcelId) : [...prev, parcelId]
    );
  };

  const handleExecuteMerge = () => {
    if (!onMergeParcels || selectedForMergeIds.length < 2) return;
    const toMerge = allParcels.filter((p) => selectedForMergeIds.includes(p.id));
    onMergeParcels(toMerge);
    setSelectedForMergeIds([]);
  };

  if (!isOpen) return null;

  const isCompact = drawerSize === 'compact';
  const kmlExportCount =
    selectedForMergeIds.length > 0 ? selectedForMergeIds.length : filteredParcels.length;

  // Minimized Bottom Bar Mode
  if (drawerSize === 'minimized') {
    return (
      <div className="no-print fixed bottom-16 left-1/2 -translate-x-1/2 z-[1200] max-w-[94vw] pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="h-11 px-3.5 apple-glass rounded-full border border-white/20 shadow-[0_14px_40px_rgba(0,0,0,0.6)] flex items-center gap-2.5 text-slate-100">
          <div className="flex items-center gap-2">
            <TableProperties className="w-4 h-4 text-amber-400 stroke-[2]" />
            <span className="text-xs font-bold text-white whitespace-nowrap">Öznitelik Tablosu</span>
            <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {totalStats.parcelCount} Parsel
            </span>
          </div>

          <div className="h-4 w-px bg-white/15" />

          <button
            type="button"
            onClick={handleExportKML}
            disabled={kmlExportCount === 0}
            className="h-7 px-2.5 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/30 text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-40"
            title="Öznitelik verileriyle KML dosyasını indir"
          >
            <Download className="w-3 h-3 text-cyan-300" />
            <span>KML İndir</span>
          </button>

          <button
            type="button"
            onClick={() => setDrawerSize('compact')}
            className="h-7 px-2.5 rounded-full bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-medium flex items-center gap-1 transition"
            title="Daraltılmış tabloyu aç"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>Dar Aç</span>
          </button>

          <button
            type="button"
            onClick={() => setDrawerSize('full')}
            className="h-7 px-2.5 rounded-full bg-blue-500/25 hover:bg-blue-500/35 text-blue-200 border border-blue-400/30 text-[11px] font-semibold flex items-center gap-1 transition"
            title="Tam ekran öznitelik tablosunu aç"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Genişlet</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition"
            title="Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="no-print fixed inset-0 z-[1200] flex flex-col justify-end pointer-events-none animate-in fade-in duration-200">
      {/* Backdrop (Yalnızca Tam Modda Arka Planı Karartır, Dar Modda Harita Etkileşimli Kalır) */}
      {!isCompact && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto transition-opacity"
        />
      )}

      {/* Slide-up Glass Drawer */}
      <div
        className={`relative pointer-events-auto text-slate-100 z-10 overflow-hidden flex flex-col apple-glass border-white/20 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] transition-all duration-200 ${
          isCompact
            ? 'w-[94vw] max-w-4xl mx-auto mb-16 h-[320px] max-h-[46vh] rounded-2xl border'
            : 'w-full max-h-[82vh] h-[680px] rounded-t-3xl border-t animate-in slide-in-from-bottom-6'
        }`}
      >
        {/* Drawer Drag Bar Handle (Tıklayarak Daralt / Genişlet) */}
        <div className="w-full flex items-center justify-center pt-2 pb-0.5">
          <button
            type="button"
            onClick={() => setDrawerSize((prev) => (prev === 'full' ? 'compact' : 'full'))}
            className="w-14 h-1.5 rounded-full bg-white/25 hover:bg-white/45 transition cursor-pointer"
            title={isCompact ? 'Ekranı Genişlet' : 'Ekranı Daralt'}
          />
        </div>

        {/* Top Header */}
        <div
          className={`${
            isCompact ? 'px-4 py-2' : 'px-6 py-3'
          } border-b border-white/[0.08] flex items-center justify-between gap-3 flex-wrap`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`${
                isCompact ? 'w-7 h-7 rounded-xl' : 'w-9 h-9 rounded-2xl'
              } bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner shrink-0`}
            >
              <TableProperties className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} stroke-[2]`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`${isCompact ? 'text-sm' : 'text-base'} font-bold text-white tracking-tight truncate`}>
                  {isCompact ? 'Öznitelik Verileri' : 'Yüklenen Kadastro Dosyaları & Öznitelik Tablosu'}
                </h2>
                <span className="text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full shrink-0">
                  {totalStats.parcelCount} Parsel ({totalStats.fileCount} Dosya)
                </span>
              </div>
              {!isCompact && (
                <p className="text-xs text-slate-400 mt-0.5">
                  KML / GeoJSON dosyalarından ayıklanan İl, İlçe, Mahalle, Ada, Parsel ve ExtendedData öznitelik bilgileri
                </p>
              )}
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Additional KML File Upload */}
            <label
              className="h-8 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition active:scale-95 shadow-md shadow-blue-600/30 border border-blue-400/40"
              title="Mevcut parsellerin yanına yeni KML dosyası ekleyin"
            >
              <FolderPlus className="w-3.5 h-3.5 stroke-[2]" />
              <span>{isCompact ? 'KML Ekle' : 'Yeni KML Ekle'}</span>
              <input
                type="file"
                multiple
                accept=".kml,.geojson,.json"
                onChange={onUploadAdditionalKML}
                className="hidden"
              />
            </label>

            {/* Export Attributes & Geometries as KML */}
            <button
              type="button"
              onClick={handleExportKML}
              disabled={kmlExportCount === 0}
              className="h-8 px-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border border-cyan-400/35 disabled:opacity-40"
              title={
                selectedForMergeIds.length > 0
                  ? `Seçili ${selectedForMergeIds.length} parseli öznitelik verileriyle KML olarak indir`
                  : 'Tablodaki parselleri tüm öznitelik verileriyle (.kml) indir'
              }
            >
              <Download className="w-3.5 h-3.5 text-cyan-300 stroke-[2]" />
              <span>
                KML İndir{selectedForMergeIds.length > 0 ? ` (${selectedForMergeIds.length})` : ''}
              </span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={allParcels.length === 0}
              className="h-8 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition active:scale-95 border border-white/10 disabled:opacity-40"
              title="Öznitelik tablosunu CSV/Excel formatında indirin"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
              <span>{isCompact ? '.csv' : 'Tabloyu İndir (.csv)'}</span>
            </button>

            <div className="h-4 w-px bg-white/15 mx-0.5" />

            {/* Daralt / Genişlet Butonu */}
            <button
              type="button"
              onClick={() => setDrawerSize(isCompact ? 'full' : 'compact')}
              className={`h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition active:scale-95 border ${
                isCompact
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/35'
                  : 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10'
              }`}
              title={isCompact ? 'Öznitelik ekranını tam genişliğe büyüt' : 'Öznitelik ekranını daralt (haritayı arka planda görünür ve tıklanabilir tut)'}
            >
              {isCompact ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Genişlet</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Daralt</span>
                </>
              )}
            </button>

            {/* Alt Şeride Küçült */}
            <button
              type="button"
              onClick={() => setDrawerSize('minimized')}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition"
              title="Alt şeride küçült"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar: Stats Chips + Search Filter + File Filter */}
        <div className={`${isCompact ? 'px-4 py-1.5' : 'px-6 py-2.5'} bg-black/20 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-wrap text-xs`}>
          {/* Summary Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center gap-1.5">
              <span className="text-slate-400">Toplam Alan:</span>
              <span className="font-mono font-bold text-emerald-400">
                {totalStats.totalAreaM2.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} m²
              </span>
              <span className="text-[10px] text-slate-400">
                ({totalStats.totalAreaHa.toFixed(3)} Ha)
              </span>
            </div>

            {/* File Filter Pill Dropdown */}
            {loadedFiles.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px]">Dosya:</span>
                <select
                  value={selectedFileFilter}
                  onChange={(e) => setSelectedFileFilter(e.target.value)}
                  className="bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400"
                >
                  <option value="all" className="bg-slate-900 text-white">Tüm Dosyalar ({loadedFiles.length})</option>
                  {loadedFiles.map((f) => (
                    <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                      {f.fileName} ({f.parcels.length} Parsel)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Multi-parcel Tevhit (Merge) Action Banner */}
            {selectedForMergeIds.length >= 2 && onMergeParcels && (
              <button
                onClick={handleExecuteMerge}
                className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-600/30 border border-emerald-400/40 animate-in fade-in"
              >
                <Layers className="w-3.5 h-3.5 stroke-[2]" />
                <span>Seçilen {selectedForMergeIds.length} Parseli Tevhit Et</span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ada, parsel, mahalle, dosya adı ara..."
              className="w-full bg-black/40 border border-white/15 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Table Content */}
        <div className={`flex-1 overflow-auto ${isCompact ? 'p-2.5' : 'p-4'} select-text`}>
          {filteredParcels.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-slate-400">
              <TableProperties className="w-12 h-12 stroke-[1.5] text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-300">
                {searchTerm ? 'Aramanıza uygun kadastro parseli bulunamadı.' : 'Henüz yüklenmiş kadastro dosyası yok.'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Yukarıdaki "Yeni KML Ekle" butonuna basarak bir veya birden çok dosya yükleyebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/20">
              <table className="w-full text-left text-xs text-slate-200 border-collapse">
                <thead>
                  <tr className="bg-white/[0.06] text-slate-300 uppercase tracking-wider text-[10px] font-bold border-b border-white/10 select-none">
                    <th className="py-2.5 px-2.5 w-9 text-center">#</th>
                    <th className="py-2.5 px-2.5 w-11 text-center" title="Tevhit veya KML indirme için çoklu seçim">Seç</th>
                    <th className="py-2.5 px-2.5 w-24">Durum</th>
                    {!isCompact && <th className="py-2.5 px-2.5">Dosya Adı</th>}
                    <th className="py-2.5 px-2.5">İl / İlçe</th>
                    <th className="py-2.5 px-2.5">Mahalle / Köy</th>
                    <th className="py-2.5 px-2.5 text-center">Ada</th>
                    <th className="py-2.5 px-2.5 text-center">Parsel</th>
                    {!isCompact && <th className="py-2.5 px-2.5">Mevkii</th>}
                    {!isCompact && <th className="py-2.5 px-2.5">Nitelik</th>}
                    <th className="py-2.5 px-2.5 text-right">Alan (m²)</th>
                    {!isCompact && <th className="py-2.5 px-2.5 text-right">Tapu Alanı</th>}
                    <th className="py-2.5 px-2.5 text-center">Eğim / Uygunluk</th>
                    <th className="py-2.5 px-2.5 text-center">Zemin (TBDY)</th>
                    <th className="py-2.5 px-2.5 text-center w-32">Eylemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredParcels.map((parcel, idx) => {
                    const isActive = parcel.id === activeParcelId;
                    const isMergeSelected = selectedForMergeIds.includes(parcel.id);
                    const isExpanded = expandedParcelId === parcel.id;
                    const rawKeys = Object.keys(parcel.rawProperties || {});

                    return (
                      <React.Fragment key={parcel.id}>
                        <tr
                          className={`transition ${
                            isActive
                              ? 'bg-blue-500/15 hover:bg-blue-500/20'
                              : isMergeSelected
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                              : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          {/* Row Number */}
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Multi-select Checkbox for Tevhit */}
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isMergeSelected}
                              onChange={() => handleToggleMergeSelect(parcel.id)}
                              className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                              title="Tevhit (Birleştirme) listesine ekle"
                            />
                          </td>

                          {/* Active Working Parcel Indicator */}
                          <td className="py-2 px-3">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white shadow-sm border border-blue-400">
                                <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                                <span>Aktif İfraz</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => onSelectActiveParcel(parcel)}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white/[0.06] hover:bg-white/15 text-slate-300 hover:text-white transition border border-white/10"
                                title="Bu parseli ana ifraz/tevhit çalışma parseli yap"
                              >
                                İfraza Al
                              </button>
                            )}
                          </td>

                          {/* File Name */}
                          {!isCompact && (
                            <td className="py-2 px-2.5 font-medium text-slate-300 truncate max-w-[150px]" title={parcel.fileName}>
                              <div className="flex items-center gap-1.5">
                                <FileCode className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="truncate">{parcel.fileName}</span>
                              </div>
                            </td>
                          )}

                          {/* İl / İlçe */}
                          <td className="py-2 px-2.5 font-medium text-slate-200">
                            {parcel.cadastralInfo.il} / {parcel.cadastralInfo.ilce}
                          </td>

                          {/* Mahalle */}
                          <td className="py-2 px-2.5 text-slate-300">
                            {parcel.cadastralInfo.mahalle}
                          </td>

                          {/* Ada No */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-amber-400">
                            {parcel.cadastralInfo.adaNo || '—'}
                          </td>

                          {/* Parsel No */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-amber-400">
                            {parcel.cadastralInfo.parselNo || '—'}
                          </td>

                          {/* Mevkii */}
                          {!isCompact && (
                            <td className="py-2 px-2.5 text-slate-400">
                              {parcel.cadastralInfo.mevkii || '—'}
                            </td>
                          )}

                          {/* Nitelik */}
                          {!isCompact && (
                            <td className="py-2 px-2.5 text-slate-300">
                              {parcel.cadastralInfo.nitelik || '—'}
                            </td>
                          )}

                          {/* Computed Area */}
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-400">
                            {parcel.areaM2.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                          </td>

                          {/* Tapu Alanı */}
                          {!isCompact && (
                            <td className="py-2 px-2.5 text-right font-mono text-slate-400">
                              {parcel.cadastralInfo.tapuAlaniM2
                                ? `${parcel.cadastralInfo.tapuAlaniM2.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} m²`
                                : '—'}
                            </td>
                          )}

                          {/* Topoğrafik Eğim & Yerleşime Uygunluk */}
                          <td className="py-2 px-3 text-center">
                            {parcel.topography ? (
                              <button
                                onClick={() => onOpenSoilAnalysis?.(parcel, 'slope')}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                                title={`Eğim: %${parcel.topography.avgSlopePercent} (${parcel.topography.avgSlopeDegrees}°) | Kot Farkı: ${parcel.topography.elevationDiffM}m | ${parcel.topography.category}`}
                              >
                                <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                                <span>%{parcel.topography.avgSlopePercent}</span>
                                <span className="text-[9px] text-slate-400 font-normal">
                                  ({parcel.topography.complianceStatus === 'uygun' ? 'UÖ' : 'ÖA'})
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-500 font-mono text-[10px]">—</span>
                            )}
                          </td>

                          {/* Zemin Sınıfı (TBDY 2018) */}
                          <td className="py-2 px-3 text-center">
                            {parcel.soilClassification ? (
                              <button
                                onClick={() => onOpenSoilAnalysis?.(parcel, 'soil')}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer"
                                title={`${parcel.soilClassification.className} | qa: ${parcel.soilClassification.bearingCapacityKgCm2} kg/cm² | Vs30: ${parcel.soilClassification.vs30} m/s`}
                              >
                                <Mountain className="w-2.5 h-2.5 text-amber-400" />
                                <span>{parcel.soilClassification.soilClass}</span>
                                <span className="text-[9px] text-slate-400 font-normal">({parcel.soilClassification.bearingCapacityKgCm2} kg)</span>
                              </button>
                            ) : (
                              <span className="text-slate-500 font-mono text-[10px]">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Download Single Parcel KML */}
                              <button
                                type="button"
                                onClick={() => handleExportSingleParcelKML(parcel)}
                                className="p-1 rounded-lg hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 transition"
                                title="Bu parselin öznitelik verileriyle KML dosyasını indir"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              {/* Zoom to parcel */}
                              {onZoomToParcel && (
                                <button
                                  type="button"
                                  onClick={() => onZoomToParcel(parcel)}
                                  className="p-1 rounded-lg hover:bg-white/15 text-slate-300 hover:text-white transition"
                                  title="Haritada bu parsele odaklan (Zoom)"
                                >
                                  <Maximize className="w-3.5 h-3.5 text-blue-400" />
                                </button>
                              )}

                              {/* Toggle Raw Properties */}
                              {rawKeys.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedParcelId(isExpanded ? null : parcel.id)}
                                  className={`p-1 rounded-lg transition ${
                                    isExpanded
                                      ? 'bg-amber-500 text-slate-950 font-bold'
                                      : 'hover:bg-white/15 text-slate-300 hover:text-amber-400'
                                  }`}
                                  title="Tüm KML SimpleData & ExtendedData alanlarını görüntüle"
                                >
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}

                              {/* Delete Parcel */}
                              {onRemoveParcel && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveParcel(parcel.id)}
                                  className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                                  title="Bu parseli listeden kaldır"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible ExtendedData Inspector Row */}
                        {isExpanded && rawKeys.length > 0 && (
                          <tr className="bg-black/40 border-b border-white/[0.08]">
                            <td colSpan={isCompact ? 11 : 15} className="p-3 text-xs">
                              <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-2">
                                <div className="flex items-center justify-between text-amber-400 font-semibold text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5" />
                                    <span>Ham KML ExtendedData & SimpleData Öznitelikleri ({rawKeys.length} Alan)</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Kaynak: {parcel.fileName}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                  {rawKeys.map((key) => (
                                    <div
                                      key={key}
                                      className="bg-black/30 p-2 rounded-lg border border-white/[0.06] text-[11px]"
                                    >
                                      <div className="text-[10px] font-mono text-slate-400 uppercase truncate" title={key}>
                                        {key}
                                      </div>
                                      <div className="font-medium text-slate-200 mt-0.5 truncate" title={parcel.rawProperties[key]}>
                                        {parcel.rawProperties[key]}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Notes */}
        <div className="px-6 py-2.5 bg-black/40 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>Parsellere tıklayarak aktif ifraz parseli belirleyebilir veya haritada görüntüleyebilirsiniz.</span>
          </div>
          <div className="font-mono text-slate-400">
            Gösterilen: {filteredParcels.length} / {allParcels.length} Parsel
          </div>
        </div>

      </div>
    </div>
  );
};
