import React, { useState, useEffect } from 'react';
import { Layers, Check, X, MapPin, Tag } from 'lucide-react';
import { ParcelGeometry } from '../types';
import * as turf from '@turf/turf';

interface NewDrawnParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  geometry: ParcelGeometry | null;
  defaultLocation?: {
    il?: string;
    ilce?: string;
    mahalle?: string;
    adaNo?: string;
    parselNo?: string;
  };
  onSaveParcel: (params: {
    parcelName: string;
    adaNo: string;
    parselNo: string;
    nitelik: string;
    targetMode: 'active' | 'secondary';
  }) => void;
}

export const NewDrawnParcelModal: React.FC<NewDrawnParcelModalProps> = ({
  isOpen,
  onClose,
  geometry,
  defaultLocation,
  onSaveParcel
}) => {
  const [parcelName, setParcelName] = useState('');
  const [adaNo, setAdaNo] = useState('');
  const [parselNo, setParselNo] = useState('');
  const [nitelik, setNitelik] = useState('Arsa / Parsel');
  const [targetMode, setTargetMode] = useState<'active' | 'secondary'>('secondary');

  const areaM2 = geometry ? turf.area(geometry) : 0;

  useEffect(() => {
    if (isOpen && geometry) {
      const defaultAda = defaultLocation?.adaNo || '101';
      const defaultParsel = defaultLocation?.parselNo ? `${defaultLocation.parselNo}-A` : '1';
      setAdaNo(defaultAda);
      setParselNo(defaultParsel);
      setParcelName(`Parsel ${defaultAda}/${defaultParsel}`);
      setTargetMode('secondary');
    }
  }, [isOpen, geometry, defaultLocation]);

  if (!isOpen || !geometry) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveParcel({
      parcelName: parcelName.trim() || `Parsel ${adaNo}/${parselNo}`,
      adaNo: adaNo.trim() || '101',
      parselNo: parselNo.trim() || '1',
      nitelik: nitelik.trim() || 'Arsa / Parsel',
      targetMode
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md apple-glass rounded-3xl p-6 shadow-2xl border border-white/20 text-white space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
              <Tag className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Kapanan Alan Adlandırma
              </h3>
              <p className="text-xs text-slate-400">
                Elle çizilen parsel alanı için ad ve öznitelikleri belirleyin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alan ve Konum Rozeti */}
        <div className="bg-white/[0.04] p-3 rounded-2xl border border-white/[0.08] flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Hesaplanan Alan
            </div>
            <div className="text-lg font-mono font-extrabold text-emerald-400">
              {areaM2.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} m²
            </div>
          </div>
          {defaultLocation && (
            <div className="text-right space-y-0.5 text-xs text-slate-300">
              <div className="flex items-center justify-end gap-1 text-cyan-400 font-semibold">
                <MapPin className="w-3.5 h-3.5" />
                <span>{defaultLocation.il || 'Ankara'} / {defaultLocation.ilce || 'Gölbaşı'}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                {defaultLocation.mahalle || 'İncek'}
              </div>
            </div>
          )}
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Parsel / Alan Adı */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Alan / Parsel Adı <span className="text-cyan-400">*</span>
            </label>
            <input
              type="text"
              required
              value={parcelName}
              onChange={(e) => setParcelName(e.target.value)}
              placeholder="Örn: 101/18 İlave Parsel"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/15 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition"
              autoFocus
            />
          </div>

          {/* Ada & Parsel No */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ada No
              </label>
              <input
                type="text"
                value={adaNo}
                onChange={(e) => {
                  setAdaNo(e.target.value);
                  if (parcelName.startsWith('Parsel ')) {
                    setParcelName(`Parsel ${e.target.value}/${parselNo}`);
                  }
                }}
                placeholder="101"
                className="w-full h-9 px-3 rounded-xl bg-white/[0.06] border border-white/15 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Parsel No
              </label>
              <input
                type="text"
                value={parselNo}
                onChange={(e) => {
                  setParselNo(e.target.value);
                  if (parcelName.startsWith('Parsel ')) {
                    setParcelName(`Parsel ${adaNo}/${e.target.value}`);
                  }
                }}
                placeholder="1"
                className="w-full h-9 px-3 rounded-xl bg-white/[0.06] border border-white/15 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition font-mono"
              />
            </div>
          </div>

          {/* Nitelik */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nitelik
            </label>
            <input
              type="text"
              value={nitelik}
              onChange={(e) => setNitelik(e.target.value)}
              placeholder="Arsa / Tarla / Bahçe"
              className="w-full h-9 px-3 rounded-xl bg-white/[0.06] border border-white/15 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition"
            />
          </div>

          {/* Hedef Çalışma Modu: İlave Parsel mi, Doğrudan Aktif İfraz Parseli mi? */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Kayıt Tipi
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTargetMode('secondary')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-left transition ${
                  targetMode === 'secondary'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>İlave Parsel</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Yan parsele ekle (Tevhit & Çift Parsel)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetMode('active')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-left transition ${
                  targetMode === 'active'
                    ? 'bg-blue-500/20 border-blue-400 text-blue-200 shadow-sm'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-blue-400" />
                  <span>Aktif İfraz Parseli</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Hemen ifraza başla (Ana Poligon)
                </div>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-medium transition"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="flex-1 h-9 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/25 active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Parseli Kaydet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
