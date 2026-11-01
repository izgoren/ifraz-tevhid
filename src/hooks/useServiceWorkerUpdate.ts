import { useEffect, useState, useCallback } from 'react';

export function useServiceWorkerUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [lastCheckedText, setLastCheckedText] = useState<string>('Sürüm 1.2 • Güncel');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Get registration
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      setSwRegistration(reg);

      // If already a waiting worker, update is immediately ready
      if (reg.waiting) {
        setHasUpdate(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setHasUpdate(true);
          }
        });
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const checkForUpdate = useCallback(async () => {
    setIsChecking(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            setHasUpdate(true);
            setLastCheckedText('Yeni sürüm hazır!');
          } else {
            setLastCheckedText('Uygulama güncel');
          }
        } else {
          setLastCheckedText('Çevrimdışı modda güncel');
        }
      }
    } catch (err) {
      console.warn('SW güncelleme kontrol hatası:', err);
      setLastCheckedText('Kontrol tamamlandı');
    } finally {
      setTimeout(() => setIsChecking(false), 600);
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }, [swRegistration]);

  return {
    hasUpdate,
    isChecking,
    lastCheckedText,
    checkForUpdate,
    applyUpdate,
    setHasUpdate
  };
}
