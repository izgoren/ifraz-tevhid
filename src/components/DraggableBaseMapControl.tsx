import React, { useState, useRef, useEffect } from 'react';
import { Layers, GripVertical } from 'lucide-react';
import { MapSettings } from '../types';

interface DraggableBaseMapControlProps {
  mapSettings: MapSettings;
  onChangeMapSettings?: (newSettings: MapSettings) => void;
}

const TILE_OPTIONS = [
  {
    id: 'googleHybrid',
    label: 'Hibrit Uydu',
    sublabel: 'Uydu + Yol & Yer İsimleri'
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

export const DraggableBaseMapControl: React.FC<DraggableBaseMapControlProps> = ({
  mapSettings,
  onChangeMapSettings
}) => {
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
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    const curPos = position || {
      x: window.innerWidth - 180,
      y: window.innerHeight - 60
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

    const newX = Math.max(12, Math.min(window.innerWidth - 180, dragStartRef.current.initPosX + deltaX));
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

    // Bastıkça döngüsel değiştir: Kullanıcı sürüklemeden tıkladığında sıradaki altlığa geçer
    if (!dragStartRef.current.hasMoved) {
      handleCycleBaseMap();
    }
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
      {/* Floating Draggable Base Map Button (No popup list, pure direct click-to-cycle) */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="h-11 px-3.5 apple-glass rounded-full flex items-center gap-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] border border-white/15 text-white cursor-grab active:cursor-grabbing transition-transform active:scale-95 hover:border-white/30"
        title={`Altlık Harita: ${currentOption.label} (Tıklayarak altlığı değiştirin, sürükleyerek taşıyın)`}
      >
        {/* Grip Indicator */}
        <GripVertical className="w-3.5 h-3.5 text-slate-400/80 -mr-0.5 cursor-grab" title="Sürükleyip Taşı" />

        {/* Map Icon with Live Glow */}
        <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0">
          <Layers className="w-3.5 h-3.5 stroke-[2]" />
        </div>

        {/* Current Active Mode Label & Cycle Indicator */}
        <div className="flex flex-col text-left pr-1 min-w-[75px]">
          <div className="flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold leading-tight">Altlık</span>
            <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1 py-0.2 rounded font-mono">Değiştir</span>
          </div>
          <span className="text-xs font-bold text-white leading-tight">{currentOption.label}</span>
        </div>
      </div>
    </div>
  );
};
