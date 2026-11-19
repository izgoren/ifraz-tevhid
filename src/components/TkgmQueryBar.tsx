import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Landmark,
  Loader2,
  MapPin,
  MousePointerClick,
  PlusCircle,
  RefreshCw,
  Search,
  X
} from 'lucide-react';

export interface TkgmAdminItem {
  id: number;
  name: string;
}

export interface TkgmParcelProperties {
  ilId?: number;
  ilAd?: string;
  ilceId?: number;
  ilceAd?: string;
  mahalleId?: number;
  mahalleAd?: string;
  adaNo?: string;
  parselNo?: string;
  alan?: string;
  nitelik?: string;
  mevkii?: string;
  pafta?: string;
  zeminKmdurum?: string;
  ozet?: string;
  [key: string]: any;
}

interface TkgmQueryBarProps {
  isOpen: boolean;
  onClose: () => void;
  onParcelLoaded: (
    feature: Feature<Polygon | MultiPolygon>,
    properties: TkgmParcelProperties,
    targetMode: 'active' | 'secondary'
  ) => void;
  targetMode: 'active' | 'secondary';
  onChangeTargetMode: (mode: 'active' | 'secondary') => void;
  isMapPickMode: boolean;
  onToggleMapPickMode: () => void;
  isMapPickLoading?: boolean;
  externalResult?: {
    feature: Feature<Polygon | MultiPolygon>;
    properties: TkgmParcelProperties;
  } | null;
  externalError?: string | null;
  onClearExternalError?: () => void;
}

type QueryTab = 'il' | 'ilce' | 'mahalle' | 'ada' | 'parsel';

function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export const TkgmQueryBar: React.FC<TkgmQueryBarProps> = ({
  isOpen,
  onClose,
  onParcelLoaded,
  targetMode,
  onChangeTargetMode,
  isMapPickMode,
  onToggleMapPickMode,
  isMapPickLoading = false,
  externalResult = null,
  externalError = null,
  onClearExternalError
}) => {
  const [activeTab, setActiveTab] = useState<QueryTab | null>(null);

  // Administrative lists
  const [provinces, setProvinces] = useState<TkgmAdminItem[]>([]);
  const [districts, setDistricts] = useState<TkgmAdminItem[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<TkgmAdminItem[]>([]);

  // Selected values
  const [selectedIl, setSelectedIl] = useState<TkgmAdminItem | null>(null);
  const [selectedIlce, setSelectedIlce] = useState<TkgmAdminItem | null>(null);
  const [selectedMahalle, setSelectedMahalle] = useState<TkgmAdminItem | null>(null);
  const [adaNo, setAdaNo] = useState<string>('');
  const [parselNo, setParselNo] = useState<string>('');

  // Search filters inside lists
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Loading & error states
  const [loadingIl, setLoadingIl] = useState<boolean>(false);
  const [loadingIlce, setLoadingIlce] = useState<boolean>(false);
  const [loadingMahalle, setLoadingMahalle] = useState<boolean>(false);
  const [loadingParcel, setLoadingParcel] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Last queried parcel result metadata
  const [lastResult, setLastResult] = useState<{
    feature: Feature<Polygon | MultiPolygon>;
    properties: TkgmParcelProperties;
  } | null>(null);

  const adaInputRef = useRef<HTMLInputElement>(null);
  const parselInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch Provinces when bar opens first time
  const fetchProvinces = async () => {
    setLoadingIl(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/tkgm/il');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'İl listesi alınamadı.');
      }
      setProvinces(data.items || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'TKGM İl listesi alınamadı.');
    } finally {
      setLoadingIl(false);
    }
  };

  useEffect(() => {
    if (isOpen && provinces.length === 0 && !loadingIl) {
      fetchProvinces();
    }
  }, [isOpen]);

  // Sync external map-click query result into the 5 tabs and summary strip
  useEffect(() => {
    if (!externalResult) return;
    const { feature, properties } = externalResult;
    setLastResult({ feature, properties });
    setErrorMsg(null);
    setActiveTab(null);

    if (properties.ilId && properties.ilAd) {
      setSelectedIl({ id: Number(properties.ilId), name: String(properties.ilAd) });
    }
    if (properties.ilceId && properties.ilceAd) {
      setSelectedIlce({ id: Number(properties.ilceId), name: String(properties.ilceAd) });
    }
    if (properties.mahalleId && properties.mahalleAd) {
      setSelectedMahalle({ id: Number(properties.mahalleId), name: String(properties.mahalleAd) });
    }
    if (properties.adaNo !== undefined) {
      setAdaNo(String(properties.adaNo));
    }
    if (properties.parselNo !== undefined) {
      setParselNo(String(properties.parselNo));
    }
  }, [externalResult]);

  // Collapse dropdown if map pick mode turns on
  useEffect(() => {
    if (isMapPickMode) {
      setActiveTab(null);
    }
  }, [isMapPickMode]);

  // Focus appropriate input on tab change
  useEffect(() => {
    setSearchTerm('');
    if (!activeTab) return;
    const t = setTimeout(() => {
      if (activeTab === 'ada') adaInputRef.current?.focus();
      else if (activeTab === 'parsel') parselInputRef.current?.focus();
      else searchInputRef.current?.focus();
    }, 40);
    return () => clearTimeout(t);
  }, [activeTab]);

  // Select Province -> fetch Districts
  const handleSelectIl = async (il: TkgmAdminItem) => {
    setSelectedIl(il);
    setSelectedIlce(null);
    setSelectedMahalle(null);
    setDistricts([]);
    setNeighborhoods([]);
    setErrorMsg(null);
    setActiveTab('ilce');
    setLoadingIlce(true);

    try {
      const res = await fetch(`/api/tkgm/il/${il.id}/ilce`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'İlçe listesi alınamadı.');
      }
      setDistricts(data.items || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'TKGM İlçe listesi alınamadı.');
    } finally {
      setLoadingIlce(false);
    }
  };

  // Select District -> fetch Neighborhoods
  const handleSelectIlce = async (ilce: TkgmAdminItem) => {
    setSelectedIlce(ilce);
    setSelectedMahalle(null);
    setNeighborhoods([]);
    setErrorMsg(null);
    setActiveTab('mahalle');
    setLoadingMahalle(true);

    try {
      const res = await fetch(`/api/tkgm/ilce/${ilce.id}/mahalle`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Mahalle listesi alınamadı.');
      }
      setNeighborhoods(data.items || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'TKGM Mahalle listesi alınamadı.');
    } finally {
      setLoadingMahalle(false);
    }
  };

  // Select Mahalle -> jump to Ada tab
  const handleSelectMahalle = (mah: TkgmAdminItem) => {
    setSelectedMahalle(mah);
    setErrorMsg(null);
    setActiveTab('ada');
  };

  // Query Parcel GeoJSON & Details
  const handleQueryParcel = async (overrideMode?: 'active' | 'secondary') => {
    if (!selectedMahalle) {
      setErrorMsg('Lütfen önce İl, İlçe ve Mahalle seçiniz.');
      setActiveTab(!selectedIl ? 'il' : !selectedIlce ? 'ilce' : 'mahalle');
      return;
    }

    const cleanParsel = parselNo.trim();
    if (!cleanParsel) {
      setErrorMsg('Lütfen Parsel numarasını giriniz.');
      setActiveTab('parsel');
      return;
    }

    const cleanAda = adaNo.trim() || '0';
    const modeToUse = overrideMode || targetMode;

    setLoadingParcel(true);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/tkgm/parsel/${selectedMahalle.id}/${encodeURIComponent(cleanAda)}/${encodeURIComponent(cleanParsel)}`
      );
      const data = await res.json();

      if (!res.ok || !data.success || !data.feature) {
        throw new Error(data.error || `Ada ${cleanAda} / Parsel ${cleanParsel} bulunamadı.`);
      }

      const feature = data.feature as Feature<Polygon | MultiPolygon>;
      const properties: TkgmParcelProperties = {
        ilAd: selectedIl?.name,
        ilceAd: selectedIlce?.name,
        mahalleAd: selectedMahalle.name,
        adaNo: cleanAda,
        parselNo: cleanParsel,
        ...(data.properties || {}),
      };

      setLastResult({ feature, properties });
      setActiveTab(null); // Collapse drawer after successful query so map is clear
      onParcelLoaded(feature, properties, modeToUse);
    } catch (err: any) {
      setErrorMsg(err.message || 'TKGM parsel sorgulaması başarısız oldu.');
    } finally {
      setLoadingParcel(false);
    }
  };

  const filteredList = useMemo(() => {
    const q = normalizeTr(searchTerm.trim());
    const source =
      activeTab === 'il'
        ? provinces
        : activeTab === 'ilce'
        ? districts
        : activeTab === 'mahalle'
        ? neighborhoods
        : [];
    if (!q) return source;
    return source.filter((item) => normalizeTr(item.name).includes(q));
  }, [activeTab, provinces, districts, neighborhoods, searchTerm]);

  if (!isOpen) return null;

  const canQuery = Boolean(selectedMahalle && parselNo.trim());

  const tabs: Array<{
    id: QueryTab;
    label: string;
    value: string;
    completed: boolean;
    disabled: boolean;
  }> = [
    {
      id: 'il',
      label: 'İl',
      value: selectedIl?.name || 'Seçiniz',
      completed: Boolean(selectedIl),
      disabled: false,
    },
    {
      id: 'ilce',
      label: 'İlçe',
      value: selectedIlce?.name || 'Seçiniz',
      completed: Boolean(selectedIlce),
      disabled: !selectedIl,
    },
    {
      id: 'mahalle',
      label: 'Mahalle',
      value: selectedMahalle?.name || 'Seçiniz',
      completed: Boolean(selectedMahalle),
      disabled: !selectedIlce,
    },
    {
      id: 'ada',
      label: 'Ada',
      value: adaNo.trim() ? adaNo.trim() : 'Ada',
      completed: Boolean(adaNo.trim()),
      disabled: !selectedMahalle,
    },
    {
      id: 'parsel',
      label: 'Parsel',
      value: parselNo.trim() ? parselNo.trim() : 'Parsel',
      completed: Boolean(parselNo.trim()),
      disabled: !selectedMahalle,
    },
  ];

  return (
    <div className="no-print absolute top-16 left-1/2 -translate-x-1/2 z-[995] w-[760px] max-w-[calc(100vw-24rem)] min-w-[340px] flex flex-col items-center pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200 select-none">
      {/* Main Horizontal TKGM Query Bar */}
      <div className="w-full apple-glass rounded-2xl px-2.5 py-2 shadow-[0_14px_40px_rgba(0,0,0,0.5)] border border-white/15 text-slate-100 flex flex-wrap items-center gap-1.5">
        {/* Title Chip */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 shrink-0">
          <Landmark className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">TKGM PARSEL SORGU</span>
        </div>

        {/* 5 Sekmeli Seçim Çubuğu: İl | İlçe | Mahalle | Ada | Parsel */}
        <div className="flex-1 min-w-[260px] flex items-center gap-1 bg-black/25 p-1 rounded-xl border border-white/10 overflow-x-auto">
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={tab.disabled}
                onClick={() => {
                  setErrorMsg(null);
                  setActiveTab((prev) => (prev === tab.id ? null : tab.id));
                }}
                className={`flex-1 min-w-[66px] px-2 py-1 rounded-lg text-left transition flex items-center justify-between gap-1 ${
                  tab.disabled
                    ? 'opacity-40 cursor-not-allowed text-slate-500'
                    : isActive
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : tab.completed
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                title={`${idx + 1}. ${tab.label}: ${tab.value}`}
              >
                <div className="min-w-0 flex flex-col">
                  <span
                    className={`text-[9px] uppercase tracking-wider leading-none ${
                      isActive ? 'text-slate-900 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </span>
                  <span className="text-[11px] font-semibold truncate leading-tight mt-0.5">
                    {tab.value}
                  </span>
                </div>
                {isActive ? (
                  <ChevronUp className="w-3 h-3 shrink-0" />
                ) : tab.completed ? (
                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Target Mode Switch: Aktif Parsel vs İlave (Tevhit) */}
        <div
          className="flex items-center bg-black/25 p-0.5 rounded-xl border border-white/10 shrink-0"
          title="Sorgulanan parsel haritaya nasıl eklensin?"
        >
          <button
            type="button"
            onClick={() => onChangeTargetMode('active')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
              targetMode === 'active'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Aktif
          </button>
          <button
            type="button"
            onClick={() => onChangeTargetMode('secondary')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
              targetMode === 'secondary'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            İlave
          </button>
        </div>

        {/* Haritadan Tıklayarak Parsel Getir */}
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            onClearExternalError?.();
            onToggleMapPickMode();
          }}
          disabled={isMapPickLoading}
          className={`h-8 px-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shrink-0 border ${
            isMapPickMode
              ? 'bg-cyan-400 text-slate-950 border-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.55)] animate-pulse'
              : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 hover:text-white border-cyan-400/35'
          }`}
          title="Haritada tıkladığınız noktanın TKGM parselini otomatik getir"
        >
          {isMapPickLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <MousePointerClick className="w-3.5 h-3.5 stroke-[2.2]" />
          )}
          <span>{isMapPickMode ? 'Haritada Tıklayın' : 'Haritadan Getir'}</span>
        </button>

        {/* Query Action Button */}
        <button
          type="button"
          onClick={() => handleQueryParcel()}
          disabled={loadingParcel || !canQuery}
          className="h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-45 disabled:hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-500/25 shrink-0"
          title="Seçili İl / İlçe / Mahalle / Ada / Parsel bilgisini TKGM üzerinden sorgula"
        >
          {loadingParcel ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5 stroke-[2.5]" />
          )}
          <span>Sorgula</span>
        </button>

        {/* Close Bar Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
          title="TKGM Parsel Sorgu Barını Gizle"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Active Map-Pick Instruction Banner */}
      {isMapPickMode && (
        <div className="mt-1.5 w-full px-3 py-1.5 rounded-xl bg-cyan-950/90 border border-cyan-400/45 text-cyan-100 text-xs flex items-center justify-between gap-2 shadow-lg backdrop-blur-xl animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            {isMapPickLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300 shrink-0" />
            ) : (
              <MousePointerClick className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            )}
            <span>
              {isMapPickLoading
                ? 'Tıklanan konumun TKGM parseli sorgulanıyor...'
                : targetMode === 'secondary'
                ? 'Haritada ilave (tevhit) olarak eklemek istediğiniz parselin üzerine tıklayın.'
                : 'Haritada getirmek istediğiniz parselin üzerine tıklayın.'}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleMapPickMode}
            className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white transition shrink-0"
          >
            İptal
          </button>
        </div>
      )}

      {/* Error Message Banner */}
      {(errorMsg || externalError) && (
        <div className="mt-1.5 w-full px-3 py-1.5 rounded-xl bg-rose-950/90 border border-rose-400/40 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-lg backdrop-blur-xl">
          <span>{errorMsg || externalError}</span>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              onClearExternalError?.();
            }}
            className="text-rose-300 hover:text-white p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Tab Content Panel (İl / İlçe / Mahalle Searchable Grid OR Ada / Parsel Inputs) */}
      {activeTab && (
        <div className="mt-1.5 w-full apple-glass rounded-2xl p-3 shadow-2xl border border-white/15 text-slate-100 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {(activeTab === 'il' || activeTab === 'ilce' || activeTab === 'mahalle') && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={
                      activeTab === 'il'
                        ? 'İl ara (örn: Ankara, İstanbul, İzmir)...'
                        : activeTab === 'ilce'
                        ? `${selectedIl?.name || ''} ilçelerinde ara...`
                        : `${selectedIlce?.name || ''} mahalle / köylerinde ara...`
                    }
                    className="w-full h-8 pl-8 pr-3 rounded-xl bg-black/35 border border-white/15 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                {activeTab === 'il' && (
                  <button
                    type="button"
                    onClick={fetchProvinces}
                    disabled={loadingIl}
                    className="h-8 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-200 flex items-center gap-1 transition"
                    title="İl Listesini Yenile"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingIl ? 'animate-spin' : ''}`} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab(null)}
                  className="h-8 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 hover:text-white transition"
                >
                  Kapat
                </button>
              </div>

              {/* Loading / List */}
              {(activeTab === 'il' && loadingIl) ||
              (activeTab === 'ilce' && loadingIlce) ||
              (activeTab === 'mahalle' && loadingMahalle) ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-300">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>TKGM sunucusundan veriler yükleniyor...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400">
                  Eşleşen kayıt bulunamadı.
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-1.5 pr-1">
                  {filteredList.map((item) => {
                    const isSelected =
                      (activeTab === 'il' && selectedIl?.id === item.id) ||
                      (activeTab === 'ilce' && selectedIlce?.id === item.id) ||
                      (activeTab === 'mahalle' && selectedMahalle?.id === item.id);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (activeTab === 'il') handleSelectIl(item);
                          else if (activeTab === 'ilce') handleSelectIlce(item);
                          else handleSelectMahalle(item);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-left text-xs transition flex items-center justify-between gap-1 border ${
                          isSelected
                            ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200 font-bold'
                            : 'bg-white/[0.04] hover:bg-white/10 border-white/[0.06] text-slate-200'
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Ada & Parsel Sekmeleri */}
          {(activeTab === 'ada' || activeTab === 'parsel') && (
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="flex-1 min-w-[140px] space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Ada Numarası</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdaNo('0');
                      setActiveTab('parsel');
                    }}
                    className="text-[10px] text-amber-300 hover:text-amber-200 underline normal-case font-medium"
                  >
                    Adasız (0)
                  </button>
                </label>
                <input
                  ref={adaInputRef}
                  type="text"
                  inputMode="numeric"
                  value={adaNo}
                  onChange={(e) => setAdaNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveTab('parsel');
                    }
                  }}
                  placeholder="Örn: 2940 (yoksa 0)"
                  className="w-full h-9 px-3 rounded-xl bg-black/35 border border-white/15 text-xs font-mono font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex-1 min-w-[140px] space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Parsel Numarası
                </label>
                <input
                  ref={parselInputRef}
                  type="text"
                  inputMode="numeric"
                  value={parselNo}
                  onChange={(e) => setParselNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleQueryParcel();
                    }
                  }}
                  placeholder="Örn: 25"
                  className="w-full h-9 px-3 rounded-xl bg-black/35 border border-white/15 text-xs font-mono font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <button
                type="button"
                onClick={() => handleQueryParcel()}
                disabled={loadingParcel || !canQuery}
                className="h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-45 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md"
              >
                {loadingParcel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MapPin className="w-3.5 h-3.5 stroke-[2.2]" />
                )}
                <span>Parseli Getir</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 hover:text-white transition"
              >
                Kapat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Compact Result Summary Strip (Shown when drawer is collapsed and a parcel was queried) */}
      {!activeTab && lastResult && (
        <div className="mt-1.5 w-full apple-glass rounded-xl px-3 py-1.5 shadow-lg border border-emerald-400/25 text-slate-200 text-[11px] flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 font-bold text-emerald-300">
              <Building2 className="w-3.5 h-3.5" />
              {lastResult.properties.ilAd} / {lastResult.properties.ilceAd} • {lastResult.properties.mahalleAd}
            </span>
            <span className="text-slate-500">|</span>
            <span className="font-mono font-bold text-amber-300">
              Ada {lastResult.properties.adaNo} / Parsel {lastResult.properties.parselNo}
            </span>
            {lastResult.properties.alan && (
              <>
                <span className="text-slate-500">|</span>
                <span className="font-mono text-white font-semibold">{lastResult.properties.alan} m²</span>
              </>
            )}
            {lastResult.properties.nitelik && (
              <>
                <span className="text-slate-500 hidden sm:inline">|</span>
                <span className="text-slate-300 truncate max-w-[200px] hidden sm:inline">
                  {lastResult.properties.nitelik}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onParcelLoaded(lastResult.feature, lastResult.properties, 'active')}
              className="px-2 py-0.5 rounded-lg bg-blue-500/25 hover:bg-blue-500/40 text-blue-200 border border-blue-400/30 font-semibold transition"
              title="Bu parseli aktif çalışma parseli olarak haritada odakla"
            >
              Odakla
            </button>
            <button
              type="button"
              onClick={() => onParcelLoaded(lastResult.feature, lastResult.properties, 'secondary')}
              className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/30 font-semibold flex items-center gap-1 transition"
              title="Tevhit için ilave parsel olarak ekle"
            >
              <PlusCircle className="w-3 h-3" />
              <span>İlave Ekle</span>
            </button>
            <button
              type="button"
              onClick={() => setLastResult(null)}
              className="text-slate-400 hover:text-white p-0.5 rounded"
              title="Özeti Gizle"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
