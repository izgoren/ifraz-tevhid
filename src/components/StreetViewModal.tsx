import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
  useApiLoadingStatus,
  APILoadingStatus
} from '@vis.gl/react-google-maps';
import {
  X,
  Compass,
  Navigation,
  Maximize2,
  Minimize2,
  PanelBottom,
  AlertCircle,
  Loader2,
  RotateCcw,
  GripHorizontal,
  LocateFixed,
  MapPin
} from 'lucide-react';

export interface StreetViewRequest {
  lat: number;
  lng: number;
  requestId: number;
}

export interface StreetViewCameraState {
  lat: number;
  lng: number;
  heading: number;
}

type StreetViewLayoutMode = 'floating' | 'splitBottom' | 'fullscreen';

interface StreetViewModalProps {
  isOpen: boolean;
  request: StreetViewRequest | null;
  onClose: () => void;
  onCameraStateChanged?: (state: StreetViewCameraState) => void;
  onFocusOnBaseMap?: (loc: { lat: number; lng: number }) => void;
}

const getGoogleMapsApiKey = (): string => {
  try {
    return (import.meta.env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';
  } catch {
    return '';
  }
};

// Attaches Google's blue Street View coverage lines layer onto the optional fullscreen mini-map
const MiniMapCoverageLayer: React.FC = () => {
  const map = useMap('sv-fullscreen-minimap');
  const streetViewLib = useMapsLibrary('streetView');

  useEffect(() => {
    if (!map || !streetViewLib) return;
    const coverageLayer = new streetViewLib.StreetViewCoverageLayer();
    coverageLayer.setMap(map);
    return () => {
      coverageLayer.setMap(null);
    };
  }, [map, streetViewLib]);

  return null;
};

interface StreetViewInnerProps {
  request: StreetViewRequest;
  layoutMode: StreetViewLayoutMode;
  onChangeLayoutMode: (mode: StreetViewLayoutMode) => void;
  onClose: () => void;
  onCameraStateChanged?: (state: StreetViewCameraState) => void;
  onFocusOnBaseMap?: (loc: { lat: number; lng: number }) => void;
  onHeaderPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const StreetViewInner: React.FC<StreetViewInnerProps> = ({
  request,
  layoutMode,
  onChangeLayoutMode,
  onClose,
  onCameraStateChanged,
  onFocusOnBaseMap,
  onHeaderPointerDown
}) => {
  const apiStatus = useApiLoadingStatus();
  const streetViewLib = useMapsLibrary('streetView');
  const coreLib = useMapsLibrary('core');
  const panoContainerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const onCameraStateChangedRef = useRef(onCameraStateChanged);
  onCameraStateChangedRef.current = onCameraStateChanged;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number }>({
    lat: request.lat,
    lng: request.lng
  });
  const [pov, setPov] = useState<{ heading: number; pitch: number }>({ heading: 0, pitch: 0 });
  const [locationDescription, setLocationDescription] = useState<string>('');
  const [showFullscreenMiniMap, setShowFullscreenMiniMap] = useState<boolean>(false);

  const loadPanoramaAt = useCallback(
    async (targetLoc: { lat: number; lng: number }) => {
      if (!streetViewLib || !panoContainerRef.current) return;

      setIsLoading(true);
      setErrorMsg(null);

      const svService = new streetViewLib.StreetViewService();

      const queryWithRadius = async (radius: number) => {
        return svService.getPanorama({
          location: targetLoc,
          radius,
          preference: streetViewLib.StreetViewPreference.NEAREST,
          source: streetViewLib.StreetViewSource.DEFAULT
        });
      };

      try {
        let result: google.maps.StreetViewResponse | null = null;
        try {
          result = await queryWithRadius(100);
        } catch (firstErr: any) {
          const msgStr = String(firstErr?.code || firstErr?.message || firstErr || '');
          if (msgStr.includes('OVER_QUERY_LIMIT') || msgStr.includes('RESOURCE_EXHAUSTED') || msgStr.includes('429')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            setErrorMsg('Google Maps kullanım kotası aşıldı. Lütfen daha sonra tekrar deneyin.');
            setIsLoading(false);
            return;
          }
          result = await queryWithRadius(500);
        }

        const panoData = result?.data;
        const panoLoc = panoData?.location;
        if (!panoLoc?.pano) {
          setErrorMsg('Bu konumun 500 m yakınında Sokak Görünümü bulunamadı. Haritada mavi işaretli sokaklara bırakın.');
          setIsLoading(false);
          return;
        }

        const resolvedLat = panoLoc.latLng?.lat() ?? targetLoc.lat;
        const resolvedLng = panoLoc.latLng?.lng() ?? targetLoc.lng;

        // Orient camera toward the dropped point (or parcel)
        const dLng = ((targetLoc.lng - resolvedLng) * Math.PI) / 180;
        const lat1 = (resolvedLat * Math.PI) / 180;
        const lat2 = (targetLoc.lat * Math.PI) / 180;
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        const rawHeading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        const initialHeading = Number.isFinite(rawHeading) ? Math.round(rawHeading) : 0;

        setCurrentPos({ lat: resolvedLat, lng: resolvedLng });
        setPov({ heading: initialHeading, pitch: 2 });
        setLocationDescription(panoLoc.description || panoLoc.shortDescription || '');
        onCameraStateChangedRef.current?.({
          lat: resolvedLat,
          lng: resolvedLng,
          heading: initialHeading
        });

        if (!panoramaRef.current && panoContainerRef.current) {
          const pano = new streetViewLib.StreetViewPanorama(panoContainerRef.current, {
            pano: panoLoc.pano,
            pov: {
              heading: initialHeading,
              pitch: 2
            },
            visible: true,
            addressControl: true,
            linksControl: true,
            panControl: true,
            zoomControl: true,
            fullscreenControl: false,
            enableCloseButton: false,
            motionTracking: false,
            motionTrackingControl: false
          });
          panoramaRef.current = pano;

          pano.addListener('position_changed', () => {
            const pos = pano.getPosition();
            if (pos) {
              const nextLat = pos.lat();
              const nextLng = pos.lng();
              setCurrentPos({ lat: nextLat, lng: nextLng });
              const curPov = pano.getPov();
              const curHeading = curPov ? Math.round(((curPov.heading % 360) + 360) % 360) : 0;
              onCameraStateChangedRef.current?.({
                lat: nextLat,
                lng: nextLng,
                heading: curHeading
              });
            }
          });

          pano.addListener('pov_changed', () => {
            const p = pano.getPov();
            if (p) {
              const nextHeading = Math.round(((p.heading % 360) + 360) % 360);
              setPov({
                heading: nextHeading,
                pitch: Math.round(p.pitch)
              });
              const pos = pano.getPosition();
              if (pos) {
                onCameraStateChangedRef.current?.({
                  lat: pos.lat(),
                  lng: pos.lng(),
                  heading: nextHeading
                });
              }
            }
          });

          pano.addListener('pano_changed', () => {
            svService
              .getPanorama({ pano: pano.getPano() })
              .then(({ data }) => {
                if (data?.location?.description || data?.location?.shortDescription) {
                  setLocationDescription(data.location.description || data.location.shortDescription || '');
                }
              })
              .catch(() => {});
          });
        } else if (panoramaRef.current) {
          panoramaRef.current.setPano(panoLoc.pano);
          panoramaRef.current.setPov({
            heading: initialHeading,
            pitch: 2
          });
          panoramaRef.current.setVisible(true);
        }

        setIsLoading(false);
      } catch (err: any) {
        const msgStr = String(err?.code || err?.message || err || '');
        if (msgStr.includes('OVER_QUERY_LIMIT') || msgStr.includes('RESOURCE_EXHAUSTED') || msgStr.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          setErrorMsg('Google Maps kullanım kotası aşıldı. Lütfen daha sonra tekrar deneyin.');
        } else {
          setErrorMsg('Bu konumun 500 m yakınında Sokak Görünümü bulunamadı. Haritada mavi sokaklara bırakmayı deneyin.');
        }
        setIsLoading(false);
      }
    },
    [streetViewLib]
  );

  // Trigger panorama load only on explicit request changes
  useEffect(() => {
    if (streetViewLib) {
      loadPanoramaAt({ lat: request.lat, lng: request.lng });
    }
  }, [streetViewLib, request.lat, request.lng, request.requestId, loadPanoramaAt]);

  // Trigger panorama resize when layout mode changes
  useEffect(() => {
    if (panoramaRef.current && coreLib?.event) {
      const timer = setTimeout(() => {
        if (panoramaRef.current) {
          coreLib.event.trigger(panoramaRef.current, 'resize');
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [layoutMode, coreLib]);

  // Cleanup Street View event listeners on unmount
  useEffect(() => {
    return () => {
      if (panoramaRef.current && coreLib?.event) {
        coreLib.event.clearInstanceListeners(panoramaRef.current);
      }
      panoramaRef.current = null;
    };
  }, [coreLib]);

  // Auth failure check
  useEffect(() => {
    if (apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      setErrorMsg('Google Street View yüklenemedi. API anahtarı veya kota sınırını kontrol edin.');
      setIsLoading(false);
    }
  }, [apiStatus]);

  return (
    <div className="flex flex-col w-full h-full">
      {/* Compact Draggable Header Bar */}
      <div
        onPointerDown={layoutMode === 'floating' ? onHeaderPointerDown : undefined}
        className={`h-10 px-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0 select-none ${
          layoutMode === 'floating' ? 'cursor-grab active:cursor-grabbing touch-none' : ''
        }`}
        title={layoutMode === 'floating' ? 'Başlıktan sürükleyerek altlık harita üzerinde istediğiniz yere taşıyabilirsiniz' : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {layoutMode === 'floating' && (
            <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
            <Navigation className="w-3 h-3 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[11.5px] font-bold text-white truncate flex items-center gap-1.5">
              <span>Sokak Görünümü</span>
              {locationDescription && (
                <span className="text-[10.5px] font-medium text-sky-300 truncate max-w-[160px] sm:max-w-[240px]">
                  • {locationDescription}
                </span>
              )}
            </div>
            <div className="text-[9.5px] font-mono text-slate-400 flex items-center gap-1.5">
              <span>
                {currentPos.lat.toFixed(5)}, {currentPos.lng.toFixed(5)}
              </span>
              <span>•</span>
              <span className="flex items-center gap-0.5 text-amber-300">
                <Compass className="w-2.5 h-2.5" /> {pov.heading}°
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onFocusOnBaseMap && (
            <button
              type="button"
              onClick={() => onFocusOnBaseMap(currentPos)}
              className="h-7 px-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sky-300 hover:text-white text-[10.5px] font-medium transition flex items-center gap-1"
              title="Altlık haritayı sokak konumuna odakla"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Odakla</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => loadPanoramaAt({ lat: request.lat, lng: request.lng })}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-slate-200 hover:text-white flex items-center justify-center transition"
            title="İlk bırakılan noktaya dön"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Layout Mode Switcher: Yüzen Pencere / Alt Bölünmüş / Tam Ekran */}
          <button
            type="button"
            onClick={() =>
              onChangeLayoutMode(layoutMode === 'splitBottom' ? 'floating' : 'splitBottom')
            }
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition ${
              layoutMode === 'splitBottom'
                ? 'bg-blue-500 text-white border-blue-400'
                : 'bg-white/10 hover:bg-white/20 border-white/10 text-slate-200 hover:text-white'
            }`}
            title={layoutMode === 'splitBottom' ? 'Yüzen Pencere Moduna Geç' : 'Altlık Haritayla Alt-Üst Böl'}
          >
            <PanelBottom className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeLayoutMode(layoutMode === 'fullscreen' ? 'floating' : 'fullscreen')
            }
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition ${
              layoutMode === 'fullscreen'
                ? 'bg-blue-500 text-white border-blue-400'
                : 'bg-white/10 hover:bg-white/20 border-white/10 text-slate-200 hover:text-white'
            }`}
            title={layoutMode === 'fullscreen' ? 'Altlık Harita Üzerine Küçült' : 'Tam Ekran Yap'}
          >
            {layoutMode === 'fullscreen' ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-rose-500/85 hover:bg-rose-500 text-white flex items-center justify-center transition shadow-sm"
            title="Sokak Görünümünü Kapat"
          >
            <X className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Panorama Container */}
      <div className="relative flex-1 min-h-0 bg-slate-950">
        <div ref={panoContainerRef} className="w-full h-full min-h-[200px]" />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-slate-200">
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            <span className="text-xs font-medium">Sokak görünümü yükleniyor...</span>
          </div>
        )}

        {/* Error / ZERO_RESULTS State */}
        {errorMsg && !isLoading && (
          <div className="absolute inset-0 z-20 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div className="max-w-sm space-y-1">
              <div className="text-xs font-bold text-white">Sokak Görünümü Bulunamadı</div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-7 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold transition"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Optional Mini-Map only in Fullscreen Mode (since in floating/split modes the live Leaflet base map IS already visible!) */}
        {layoutMode === 'fullscreen' && (
          <>
            {showFullscreenMiniMap ? (
              <div className="absolute bottom-4 left-4 z-20 w-64 h-44 rounded-2xl overflow-hidden border border-white/25 shadow-2xl bg-slate-900">
                <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between pointer-events-none">
                  <div className="px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-blue-400/40 text-[10px] font-semibold text-blue-300 flex items-center gap-1 pointer-events-auto">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    <span>Mavi sokağa tıklayın</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFullscreenMiniMap(false)}
                    className="w-6 h-6 rounded-full bg-slate-950/80 hover:bg-slate-900 text-slate-300 hover:text-white border border-white/15 flex items-center justify-center pointer-events-auto transition"
                    title="Mini Haritayı Gizle"
                  >
                    <Minimize2 className="w-3 h-3" />
                  </button>
                </div>

                <GoogleMap
                  id="sv-fullscreen-minimap"
                  mapId="DEMO_MAP_ID"
                  defaultCenter={currentPos}
                  center={currentPos}
                  defaultZoom={17}
                  gestureHandling="greedy"
                  disableDefaultUI={true}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                  onClick={(ev) => {
                    if (ev.detail.latLng) {
                      loadPanoramaAt({
                        lat: ev.detail.latLng.lat,
                        lng: ev.detail.latLng.lng
                      });
                    }
                  }}
                >
                  <MiniMapCoverageLayer />
                  <AdvancedMarker position={currentPos} title="Sokak Görünümü Konumu">
                    <div
                      className="w-7 h-7 rounded-full bg-amber-400 border-2 border-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.9)] flex items-center justify-center"
                      style={{ transform: `rotate(${pov.heading}deg)` }}
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-slate-950">
                        <path d="M12 2L17 14L12 11L7 14L12 2Z" />
                      </svg>
                    </div>
                  </AdvancedMarker>
                </GoogleMap>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowFullscreenMiniMap(true)}
                className="absolute bottom-4 left-4 z-20 h-8 px-3 rounded-full bg-slate-950/85 hover:bg-slate-900 text-white border border-white/20 text-[11px] font-semibold flex items-center gap-1.5 shadow-xl transition"
              >
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                <span>Mini Harita</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const StreetViewModal: React.FC<StreetViewModalProps> = ({
  isOpen,
  request,
  onClose,
  onCameraStateChanged,
  onFocusOnBaseMap
}) => {
  const [layoutMode, setLayoutMode] = useState<StreetViewLayoutMode>('floating');
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);

  // Keep floating window inside viewport on resize
  useEffect(() => {
    const handleResize = () => {
      if (!floatingPos || !floatingRef.current) return;
      const w = floatingRef.current.offsetWidth || 500;
      const h = floatingRef.current.offsetHeight || 320;
      setFloatingPos((prev) =>
        prev
          ? {
              x: Math.max(8, Math.min(window.innerWidth - w - 8, prev.x)),
              y: Math.max(8, Math.min(window.innerHeight - h - 8, prev.y))
            }
          : null
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [floatingPos]);

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!floatingRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = floatingRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = rect.left;
    const origY = rect.top;
    const w = rect.width;
    const h = rect.height;

    const onMove = (mv: PointerEvent) => {
      const nextX = Math.max(8, Math.min(window.innerWidth - w - 8, origX + (mv.clientX - startX)));
      const nextY = Math.max(8, Math.min(window.innerHeight - h - 8, origY + (mv.clientY - startY)));
      setFloatingPos({ x: nextX, y: nextY });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  if (!isOpen || !request) return null;

  const apiKey = getGoogleMapsApiKey();

  const containerClassName =
    layoutMode === 'fullscreen'
      ? 'no-print fixed inset-3 z-[1150] apple-glass rounded-3xl border border-white/20 shadow-[0_28px_80px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col animate-in fade-in duration-150'
      : layoutMode === 'splitBottom'
      ? 'no-print fixed left-3 right-3 md:left-[316px] md:right-16 bottom-16 h-[44vh] min-h-[260px] z-[1120] apple-glass rounded-2xl border border-white/20 shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-150'
      : 'no-print fixed z-[1120] w-[520px] max-w-[calc(100vw-88px)] h-[330px] max-h-[55vh] apple-glass rounded-2xl border border-sky-400/35 shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150';

  const floatingStyle: React.CSSProperties | undefined =
    layoutMode === 'floating'
      ? floatingPos
        ? { left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }
        : { right: '68px', bottom: '64px' }
      : undefined;

  return (
    <div ref={floatingRef} style={floatingStyle} className={containerClassName}>
      {!apiKey ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3 text-slate-200">
          <AlertCircle className="w-8 h-8 text-amber-400" />
          <div className="text-sm font-bold text-white">Google Maps API Anahtarı Bulunamadı</div>
          <p className="text-xs text-slate-400 max-w-md">
            Sokak görünümünü açmak için <code className="text-amber-300">VITE_GOOGLE_MAPS_API_KEY</code> ortam değişkeninin yapılandırılmış olması gerekir.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition"
          >
            Kapat
          </button>
        </div>
      ) : (
        <APIProvider
          apiKey={apiKey}
          language="tr"
          region="TR"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        >
          <StreetViewInner
            request={request}
            layoutMode={layoutMode}
            onChangeLayoutMode={setLayoutMode}
            onClose={onClose}
            onCameraStateChanged={onCameraStateChanged}
            onFocusOnBaseMap={onFocusOnBaseMap}
            onHeaderPointerDown={handleHeaderPointerDown}
          />
        </APIProvider>
      )}
    </div>
  );
};
