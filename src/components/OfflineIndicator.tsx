import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[1200] flex items-center gap-2 rounded-full apple-glass border border-amber-500/40 bg-amber-950/85 px-3.5 py-1.5 text-xs font-medium text-amber-200 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
      <span>Çevrimdışı Mod — Önbellekteki harita verileri kullanılıyor</span>
    </div>
  );
};
