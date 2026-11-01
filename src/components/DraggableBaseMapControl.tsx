import React, { useState, useRef, useEffect } from 'react';
import { Layers, Check, GripVertical, Map, RotateCcw, X, ChevronUp } from 'lucide-react';
import { MapSettings } from '../types';

interface DraggableBaseMapControlProps {
  mapSettings: MapSettings;
  onChangeMapSettings?: (newSettings: MapSettings) => void;
}

const TILE_OPTIONS = [
  {
    id: 'googleHybrid',
    label: 'Hibrit Uydu',
    sublabel: 'Uydu + Yol & Yer İsimleri',
    previewBg: 'from-blue-900/60 to-slate-900/80',
    badge: 'Önerilen',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  },
  {
    id: 'googleSatellite',
    label: 'Saf Uydu',
    sublabel: 'Yüksek Çözünürlüklü Hava Fotoğrafı',
    previewBg: 'from-emerald-950/60 to-slate-900/80',
    badge: 'Saf Görünüm',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  },
  {
    id: 'osm',
    label: 'Standart Sokak',
    sublabel: 'Vektörel İmar & Sokak Haritası',
    previewBg: 'from-amber-950/60 to-slate-900/80',
    badge: 'Harita',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  }
] as const;

export const DraggableBaseMapControl: React.FC<DraggableBaseMapControlProps> = ({
  mapSettings,
  onChangeMapSettings
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // Position from bottom-right by default
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initPosX: number; initPosY: number; hasMoved: boolean }>({
    startX: 0,
    startY: 0,
    initPosX: 0,
    initPosY: 0,
    hasMoved: false
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize position in bottom-right corner
  useEffect(() => {
    if (!position) {
      const defaultRight = 20;
      const defaultBottom = 20;
      const x = Math.max(20, window.innerWidth - 180 - defaultRight);
      const y = Math.max(80, window.innerHeight - 56 - defaultBottom);
      setPosition({ x, y });
    }
  }, [position]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag with primary mouse or single touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    const curPos = position || {
      x: window.innerWidth - 200,
      y: window.innerHeight - 76
    };

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initPosX: curPos.x,
      initPosY: curPos.y,
      hasMoved: false
    };

    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    if (Math.hypot(deltaX, deltaY) > 4) {
      dragStartRef.current.hasMoved = true;
    }

    const newX = Math.max(12, Math.min(window.innerWidth - 200, dragStartRef.current.initPosX + deltaX));
    const newY = Math.max(64, Math.min(window.innerHeight - 60, dragStartRef.current.initPosY + deltaY));

    setPosition({ x: newX, y: newY });
  };

  const handleCycleBaseMap = () => {
    if (!onChangeMapSettings) return;
    const currentIndex = TILE_OPTIONS.findIndex((opt) => opt.id === mapSettings.tileProvider);
    const nextIndex = (currentIndex + 1) % TILE_OPTIONS.length;
    const nextOption = TILE_OPTIONS[nextIndex];
    onChangeMapSettings({ ...mapSettings, tileProvider: nextOption.id as any });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // Bastıkça değiştir: Kullanıcı sürüklemeden tıkladığında sıradaki altlığa geçer
    if (!dragStartRef.current.hasMoved) {
      handleCycleBaseMap();
    }
  };

  const handleSelectProvider = (providerId: string) => {
    if (onChangeMapSettings) {
      onChangeMapSettings({ ...mapSettings, tileProvider: providerId as any });
    }
    setIsOpen(false);
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    const x = Math.max(20, window.innerWidth - 180 - 20);
    const y = Math.max(80, window.innerHeight - 56 - 20);
    setPosition({ x, y });
  };

  const currentOption = TILE_OPTIONS.find((opt) => opt.id === mapSettings.tileProvider) || TILE_OPTIONS[0];

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1100,
        touchAction: 'none'
      }}
      className="select-none"
    >
      {/* Expanded Base Map Selection Dock (Opens upwards from button) */}
      {isOpen && (
        <div
          className="absolute bottom-full right-0 mb-2 w-72 apple-glass rounded-2xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-white/15 text-white space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4 text-blue-400 stroke-[2]" />
              <span className="text-xs font-semibold text-white tracking-tight">Altlık Harita Katmanı</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleResetPosition}
                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                title="Sağ alt köşeye sıfırla"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                title="Kapat"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Map Options */}
          <div className="space-y-1.5">
            {TILE_OPTIONS.map((opt) => {
              const isSelected = mapSettings.tileProvider === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectProvider(opt.id)}
                  className={`w-full p-2.5 rounded-xl text-left transition flex items-center justify-between border ${
                    isSelected
                      ? 'bg-blue-500/20 border-blue-400/50 shadow-sm text-white'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{opt.label}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono border ${opt.badgeColor}`}>
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">{opt.sublabel}</p>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-[9px] text-slate-400 text-center pt-1 border-t border-white/[0.06]">
            Butonu haritada istediğiniz köşeye sürükleyebilirsiniz.
          </div>
        </div>
      )}

      {/* Floating Draggable Base Map Button */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }}
        className={`h-11 px-3.5 apple-glass rounded-full flex items-center gap-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] border border-white/15 text-white cursor-grab active:cursor-grabbing transition-transform active:scale-95 ${
          isOpen ? 'ring-2 ring-blue-400/40' : ''
        }`}
        title={`Altlık Harita: ${currentOption.label} (Tıkladıkça döngüsel değiştirir, sürükleyerek taşıyabilirsiniz)`}
      >
        {/* Grip Indicator */}
        <GripVertical className="w-3.5 h-3.5 text-slate-400/80 -mr-0.5 cursor-grab" title="Sürükleyip Taşı" />

        {/* Map Icon with Live Glow */}
        <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0">
          <Layers className="w-3.5 h-3.5 stroke-[2]" />
        </div>

        {/* Current Active Mode Label & Cycle Indicator */}
        <div className="flex flex-col text-left pr-0.5 min-w-[70px]">
          <div className="flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold leading-tight">Altlık</span>
            <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1 py-0.2 rounded font-mono">Tıkla</span>
          </div>
          <span className="text-xs font-bold text-white leading-tight">{currentOption.label}</span>
        </div>

        {/* Optional Menu Chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0 ml-0.5"
          title="Tüm Altlık Listesini Göster"
        >
          <ChevronUp className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
};
