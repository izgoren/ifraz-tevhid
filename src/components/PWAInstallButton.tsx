import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X, Check, Share } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'pill' | 'button' | 'icon';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'button' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running inside standalone PWA mode, hide the install button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow (beforeinstallprompt is available)
  if (isInstallable) {
    if (variant === 'icon') {
      return (
        <button
          onClick={install}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/15 transition text-blue-400 hover:text-blue-300"
          title="Uygulamayı Cihaza Yükle (PWA)"
        >
          <Download className="w-3.5 h-3.5 stroke-[2]" />
        </button>
      );
    }

    return (
      <button
        onClick={install}
        className="h-8 px-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white text-xs font-semibold rounded-full flex items-center gap-1.5 transition active:scale-95 shadow-[0_2px_14px_rgba(59,130,246,0.4)] border border-blue-400/30"
        title="Uygulamayı Bilgisayara veya Telefona Yükle (PWA)"
      >
        <Smartphone className="w-3.5 h-3.5 stroke-[2]" />
        <span>Uygulamayı Yükle</span>
      </button>
    );
  }

  // iOS Safari flow (WebKit doesn't fire beforeinstallprompt)
  if (isIOS) {
    return (
      <>
        {variant === 'icon' ? (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/15 transition text-blue-400 hover:text-blue-300"
            title="iPhone / iPad'e Yükle"
          >
            <Smartphone className="w-3.5 h-3.5 stroke-[2]" />
          </button>
        ) : (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="h-8 px-3 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium rounded-full flex items-center gap-1.5 transition active:scale-95 border border-white/10 shadow-sm"
            title="iPhone / iPad'e Yükle"
          >
            <Smartphone className="w-3.5 h-3.5 stroke-[1.75] text-blue-400" />
            <span>iOS'a Yükle</span>
          </button>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm apple-glass rounded-3xl p-6 shadow-2xl border border-white/15 text-white space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight">iPhone / iPad'e Yükle</h3>
                    <p className="text-[11px] text-slate-400">Ana Ekrana Ekleme Rehberi</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-6 h-6 rounded-lg bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    1
                  </div>
                  <p className="leading-relaxed">
                    Safari araç çubuğundaki <strong className="text-white flex items-center gap-1 inline-flex"><Share className="w-3.5 h-3.5 inline text-blue-400" /> Paylaş</strong> butonuna dokunun.
                  </p>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-6 h-6 rounded-lg bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    2
                  </div>
                  <p className="leading-relaxed">
                    Açılan menüde aşağı kaydırarak <strong className="text-white">"Ana Ekrana Ekle"</strong> seçeneğini seçin.
                  </p>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <p className="leading-relaxed">
                    Sağ üstteki <strong className="text-white">"Ekle"</strong> butonuna dokunarak tam ekran PWA olarak kullanın.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-xs font-semibold text-white transition active:scale-[0.98] border border-white/10"
              >
                Anladım
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Also provide an install button by default so users can always see or trigger the install guide
  return (
    <button
      onClick={() => {
        // If beforeinstallprompt hasn't fired yet or browser requires user gesture
        alert('Tarayıcınızın adres çubuğundaki veya menüsündeki "Uygulamayı Yükle / Ana Ekrana Ekle" butonunu kullanarak doğrudan cihazınıza kurabilirsiniz.');
      }}
      className="h-8 px-3 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium rounded-full flex items-center gap-1.5 transition active:scale-95 border border-white/10 shadow-sm"
      title="PWA Olarak Yükle"
    >
      <Smartphone className="w-3.5 h-3.5 stroke-[1.75] text-blue-400" />
      <span>PWA Yükle</span>
    </button>
  );
};
