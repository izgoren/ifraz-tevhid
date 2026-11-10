import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Mountain,
  Download,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  HardHat,
  Compass,
  ChevronRight,
  Layers,
  HelpCircle,
  TrendingUp,
  Building2,
  Sun,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Ruler,
  ShieldCheck,
  Activity,
  FileText
} from 'lucide-react';
import { LoadedCadastralParcel, GeneratedParcel, SoilClassification, ParcelTopography } from '../types';
import { getSoilClassDetails } from '../utils/soilEstimation';
import { calculateParcelTopography } from '../utils/topographicSlope';

interface SoilAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeParcel?: LoadedCadastralParcel | GeneratedParcel | null;
  allParcels?: (LoadedCadastralParcel | GeneratedParcel)[];
  onSelectParcel?: (parcelId: string) => void;
  onUpdateSoilClass?: (parcelId: string, newSoilClass: 'ZA' | 'ZB' | 'ZC' | 'ZD' | 'ZE' | 'ZF') => void;
  initialTab?: 'soil' | 'slope';
}

export const SoilAnalysisModal: React.FC<SoilAnalysisModalProps> = ({
  isOpen,
  onClose,
  activeParcel,
  allParcels = [],
  onSelectParcel,
  onUpdateSoilClass,
  initialTab = 'soil'
}) => {
  const [activeTab, setActiveTab] = useState<'soil' | 'slope'>(initialTab);
  const [selectedId, setSelectedId] = useState<string>(activeParcel?.id || (allParcels[0]?.id ?? ''));
  const [showTableReference, setShowTableReference] = useState(false);
  const [showSlopeReference, setShowSlopeReference] = useState(false);
  const [simulationSlope, setSimulationSlope] = useState<number | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // Sync activeTab when initialTab prop updates
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Sync selectedId when activeParcel changes
  useEffect(() => {
    if (activeParcel?.id) {
      setSelectedId(activeParcel.id);
    } else if (allParcels.length > 0 && !selectedId) {
      setSelectedId(allParcels[0].id);
    }
  }, [activeParcel?.id, allParcels]);

  // Reset simulation when selected parcel changes
  useEffect(() => {
    setSimulationSlope(null);
  }, [selectedId]);

  const currentParcel = useMemo(() => {
    return allParcels.find((p) => p.id === selectedId) || activeParcel || allParcels[0] || null;
  }, [allParcels, selectedId, activeParcel]);

  // Topography calculation for current parcel
  const topo: ParcelTopography = useMemo(() => {
    if (currentParcel?.topography) {
      return currentParcel.topography;
    }
    const geom = currentParcel
      ? 'geometry' in currentParcel
        ? currentParcel.geometry
        : currentParcel.feature
      : null;
    if (geom) {
      return calculateParcelTopography(geom);
    }
    return {
      avgSlopePercent: 3.5,
      avgSlopeDegrees: 2.0,
      minElevationM: 950.0,
      maxElevationM: 953.5,
      elevationDiffM: 3.5,
      aspect: 'Güney (S)',
      aspectDegrees: 180,
      category: 'Düz / Az Eğimli (%0 - %5)',
      complianceStatus: 'uygun',
      zoningNotice: 'Standart subasman ve temel uygulamasına uygundur.'
    };
  }, [currentParcel]);

  if (!isOpen) return null;

  const soil: SoilClassification = currentParcel?.soilClassification || getSoilClassDetails('ZC');

  // Effective slope values (simulated or real)
  const currentSlopePercent = simulationSlope !== null ? simulationSlope : topo.avgSlopePercent;
  const currentSlopeDegrees = Math.round((Math.atan(currentSlopePercent / 100) * (180 / Math.PI)) * 10) / 10;

  // Settlement Suitability Analysis (Mekânsal Yerleşime Uygunluk Değerlendirmesi)
  const settlement = (() => {
    const p = currentSlopePercent;
    const elevDiff = topo.elevationDiffM;

    if (p <= 5.0) {
      return {
        code: 'UÖ-1',
        title: 'İdeal Yerleşim Alanı (Düz / Çok Az Eğimli)',
        status: 'uygun' as const,
        statusLabel: 'Yerleşime Tam Uygun',
        badgeBorder: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
        riskClass: 'text-emerald-400',
        riskLevel: 'Çok Düşük Jeolojik & Morfolojik Risk',
        suitabilityDesc: 'Altyapı maliyeti en ekonomik olan, kanalizasyon ve yağmur suyu tahliyesinde hidrolik akıntı eğiminin rahatlıkla sağlandığı, yol boyuna eğimlerinin %0.5 - %4.0 arasında kaldığı birinci derece uygun yerleşim alanıdır.',
        roadMaxSlope: 'Standart yol boyuna eğimleri (%0.5 - %4.0). Her tür binek, ağır taşıt ve itfaiye erişimi mükemmel.',
        subasmanText: 'Planlı Alanlar İmar Yön. m.14 gereği; tabii zeminden veya yol bordür üst seviyesinden +0.50m ila +1.20m arasında standart subasman kotu verilir.',
        excavationCost: 'En Düşük Kazı / Dolgu Maliyeti (%10 - %20 hafriyat fazlalığı)',
        retainingWallType: 'İstinat duvarı gerektirmez (Standart bahçe çevre çiti veya <0.50m bordür yeterlidir)',
        uncoveredBasementFloors: elevDiff >= 3.0 ? 1 : 0,
        drainageFeasibility: 'Mükemmel (Kanalizasyon minimum %0.5 akıntı eğimi korunmalıdır)',
        zoningArticle: 'Planlı Alanlar İmar Yönetmeliği Madde 14 & Mekânsal Planlar Yapım Yön. Ek-2'
      };
    } else if (p <= 15.0) {
      return {
        code: 'UÖ-2',
        title: 'Doğal Drenajlı Yerleşim Alanı (Az / Orta Eğimli)',
        status: 'uygun' as const,
        statusLabel: 'Yerleşime Uygun',
        badgeBorder: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
        riskClass: 'text-blue-400',
        riskLevel: 'Düşük Jeolojik Risk / Doğal Drenaj Avantajı',
        suitabilityDesc: 'Yüzey sularının doğal meyille göllenmeden tahliye olduğu, standart kentsel ulaşım ve altyapı şebekesinin sorunsuz inşa edildiği ideal konut ve ticaret alanıdır.',
        roadMaxSlope: 'Yol boyuna eğimleri %4.0 - %8.0 arasında rahatlıkla dengelenir. Kış aylarında hafif don/buzlanma kontrolü tavsiye edilir.',
        subasmanText: 'Bina köşe tabii zemin kotlarının ortalamasından veya yol kotundan kotlandırma yapılabilir. Bahçe düzenlemesinde hafif kademelendirme uygulanabilir.',
        excavationCost: 'Orta Düzey / Dengeli Kazı-Dolgu Planlaması',
        retainingWallType: 'Düşük yükseklikte çevre ihata duvarı (0.80m - 1.50m betonarme veya gabion)',
        uncoveredBasementFloors: elevDiff >= 5.5 ? 2 : elevDiff >= 2.6 ? 1 : 0,
        drainageFeasibility: 'Çok İyi (Doğal yüzey drenajı, su göllenme riski sıfıra yakın)',
        zoningArticle: 'Planlı Alanlar İmar Yönetmeliği Madde 10/14 & İller Bankası Eğim Normları'
      };
    } else if (p <= 25.0) {
      return {
        code: 'ÖA-1',
        title: 'Önlemli Alan 1 (Kademeli Yapılaşma ve Bodrum Kazanımı)',
        status: 'sartli_uygun' as const,
        statusLabel: 'Şartlı Uygun / Önlemli Alan',
        badgeBorder: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
        riskClass: 'text-amber-400',
        riskLevel: 'Orta Düzey Risk / Mühendislik Tedbiri Şart',
        suitabilityDesc: 'Eğimden dolayı zemin katlarda basamaklı temel/kademelendirme ve arka sınırda betonarme istinat duvarı tasarlanması zorunludur. Meyilden açığa çıkan bodrum katlar emsale dahil edilmeden kazanılabilir.',
        roadMaxSlope: 'İmar yolları parsel eğim aksına paralel geçirilmeli veya serpantin viraj kullanılmalıdır (Maksimum yol eğimi %10 - %12).',
        subasmanText: 'Madde 10 ve 20 uyarınca tabii zemin köşe kotları aritmetik ortalaması esastır. Meyilden dolayı açığa çıkan bodrum katlar kazanılabilir.',
        excavationCost: 'Yüksek Kazı Hacmi / Kademeli Temel Gerekir',
        retainingWallType: 'Betonarme L/T Tipi Konsol İstinat Duvarı (2.00m - 3.50m) + Kırma taş filtre ve delikli drenaj borusu',
        uncoveredBasementFloors: elevDiff >= 7.5 ? 2 : elevDiff >= 2.8 ? 1 : 0,
        drainageFeasibility: 'Düşüm bacaları (şüt rögarı) ile basınç kırıcı drenaj hattı gerekir',
        zoningArticle: 'Planlı Alanlar İmar Yönetmeliği Madde 20 (Meyilden Açığa Çıkan Katlar)'
      };
    } else if (p <= 40.0) {
      return {
        code: 'ÖA-2',
        title: 'Önlemli Alan 2 (Yüksek Eğim & Şev Tahkiki Zorunlu)',
        status: 'sartli_uygun' as const,
        statusLabel: 'Yüksek Önlem Gerektiren Alan',
        badgeBorder: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
        riskClass: 'text-orange-400',
        riskLevel: 'Yüksek Şev Stabilite ve Kayma Riski',
        suitabilityDesc: 'Şev stabilitesi (kayma dairesi) tahkiki yapılması, kuyu temel veya ankrajlı kazık sistemleri uygulanması, yol eğiminin max %12 ile sınırlandırılması ve bina tabanında kademelendirme yapılması zorunludur.',
        roadMaxSlope: 'Özel rampa ve viraj tasarımları zorunludur. Ağır taşıt, ambulans ve itfaiye yaklaşımı için kurtarma cepleri ayrılmalıdır.',
        subasmanText: 'Bina tabanında her 4.00 metrede bir zorunlu kademelendirme (basamaklı temel) yapılmalıdır. Yekpare tek kot subasman uygulanamaz.',
        excavationCost: 'Çok Yüksek / Kuyu Temel ve Palye Kazısı',
        retainingWallType: 'Ön gergili zemin ankrajlı kazık sistemi, mini kazıklı perde veya kademeli harçlı taş/betonarme istinat duvarı',
        uncoveredBasementFloors: elevDiff >= 8.5 ? 3 : elevDiff >= 5.5 ? 2 : 1,
        drainageFeasibility: 'Palyeli drenaj hendekleri ve yüzey suyu tahliye menfezleri zorunludur',
        zoningArticle: 'Planlı Alanlar İmar Yönetmeliği Madde 20 & Afet Bölgelerinde Yapılacak Yapılar Hakkında Yön.'
      };
    } else {
      return {
        code: 'AJE / UY',
        title: 'Ayrıntılı Jeoteknik Etüt Gerektiren / Riskli Sarp Alan',
        status: 'ozel_onlem' as const,
        statusLabel: 'Riskli / Ayrıntılı Jeoteknik Etüt Zorunlu',
        badgeBorder: 'border-rose-500/40 text-rose-400 bg-rose-500/10 font-bold',
        riskClass: 'text-rose-400',
        riskLevel: 'Kritik Heyelan, Şev Kayması ve Kaya Düşmesi Riski',
        suitabilityDesc: 'Doğal şev açısının aşıldığı dik/sarp topoğrafya. İmar planlarında park veya ağaçlandırılacak alan olarak değerlendirilmesi esastır. Yapılaşma için Bakanlık/Belediye onaylı özel jeolojik ve geoteknik heyelan tahkik raporu şarttır.',
        roadMaxSlope: 'Standart imar yolu açılamaz. Yangın ve arama kurtarma araçları erişimi için alternatif servis yolu güzergahı etüt edilmelidir.',
        subasmanText: 'Bakanlık veya Belediye onaylı Jeolojik-Jeoteknik Heyelan Güvenlik Raporu olmaksızın yapı ruhsatı ve kot verilemez.',
        excavationCost: 'Aşırı Yüksek / Özel Şantiye Güvenliği ve Kırıcı',
        retainingWallType: 'Derin konsol fore kazıklar, kalıcı çelik zemin ankrajları ve geogrid güçlendirmeli şev koruma ağı (kaya tutucu çelik ağ)',
        uncoveredBasementFloors: elevDiff >= 6.0 ? 3 : 2,
        drainageFeasibility: 'Sarp arazi erozyon kontrolü ve şantiye seddesi tahkimi zorunlu',
        zoningArticle: 'Mekânsal Planlar Yapım Yönetmeliği m.21 & İmar Kanunu m.8 (Yapı Yasaklı / Özel Önlemli Alan)'
      };
    }
  })();

  // Aspect & Solar Energy Efficiency Analysis
  const aspectAnalysis = (() => {
    const deg = topo.aspectDegrees;

    if (deg >= 135 && deg <= 225) {
      return {
        label: 'Güney Sektörü (İdeal Güneşlenme)',
        solarEfficiency: 'Maksimum (%90 - %100)',
        solarDesc: 'Kış aylarında maksimum pasif güneş enerjisi kazancı sağlar; ısıtma giderlerini %25-35 oranında düşürür.',
        architectureRec: 'Salon, oturma odaları ve ana pencereler bu cepheye konumlandırılmalıdır. Çatı güneş panelleri (GES) için en yüksek verimlilik yönüdür.',
        style: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      };
    } else if (deg >= 45 && deg < 135) {
      return {
        label: 'Doğu Sektörü (Sabah Güneşi)',
        solarEfficiency: 'Yüksek (%75 - %85)',
        solarDesc: 'Sabah güneşi alır, öğleden sonra gölgede kalır. Aşırı ısınma yapmayan dengeli bir mikroiklim sunar.',
        architectureRec: 'Yatak odaları ve mutfak gibi sabah kullanılan mekanlar için idealdir.',
        style: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
      };
    } else if (deg > 225 && deg <= 315) {
      return {
        label: 'Batı Sektörü (Öğleden Sonra & Akşam Güneşi)',
        solarEfficiency: 'Orta (%65 - %75)',
        solarDesc: 'Yazın öğleden sonra yoğun yatay güneş ışınımı alır. Aşırı ısınma ve parlamaya karşı tedbir gerekir.',
        architectureRec: 'Batı cephe pencerelerinde dıştan gölgeleme elemanları (brise-soleil / panjur) veya reflektif cam önerilir.',
        style: 'text-orange-400 bg-orange-500/10 border-orange-500/20'
      };
    } else {
      return {
        label: 'Kuzey Sektörü (Düşük Güneşlenme / Soğuk Cephe)',
        solarEfficiency: 'Düşük (%35 - %50)',
        solarDesc: 'Doğrudan güneşlenme düşüktür. Kış aylarında soğuk kuzey rüzgarlarına açık olup ısı kaybı yüksektir.',
        architectureRec: 'Merdiven boşlukları, otopark, banyo ve ıslak hacimler bu cepheye yerleştirilmeli; cephe yalıtım kalınlığı artırılmalıdır.',
        style: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
      };
    }
  })();

  const getSoilBadgeStyle = (sc: string) => {
    switch (sc) {
      case 'ZA':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-purple-500/20';
      case 'ZB':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-blue-500/20';
      case 'ZC':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/20';
      case 'ZD':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/20';
      case 'ZE':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40 shadow-orange-500/20';
      case 'ZF':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-rose-500/20';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  const getLiquefactionBadge = (risk: string) => {
    switch (risk) {
      case 'Yok':
        return { label: 'Sıvılaşma Riski Yok', style: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
      case 'Düşük':
        return { label: 'Düşük Risk', style: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
      case 'Orta':
        return { label: 'Orta Düzey Sıvılaşma Riski', style: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
      case 'Yüksek':
        return { label: 'Yüksek Sıvılaşma Riski!', style: 'text-rose-400 bg-rose-500/10 border-rose-500/20 font-bold' };
      default:
        return { label: 'Belirsiz', style: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
    }
  };

  const liqInfo = getLiquefactionBadge(soil.liquefactionRisk);

  // Copy Official Slope Settlement Report to Clipboard
  const handleCopySlopeReport = () => {
    const cad = currentParcel && 'cadastralInfo' in currentParcel ? currentParcel.cadastralInfo : undefined;
    const area = currentParcel ? currentParcel.areaM2.toFixed(1) : '—';
    const name = currentParcel?.name || 'Parsel';

    const reportText = `
================================================================================
       RESMİ PARSEL TOPOĞRAFİK EĞİM & YERLEŞİME UYGUNLUK RAPORU
================================================================================
İl / İlçe / Mahalle : ${cad?.il || '—'} / ${cad?.ilce || '—'} / ${cad?.mahalle || '—'}
Ada / Parsel No     : ${cad?.adaNo || '—'} / ${cad?.parselNo || '—'}
Parsel Tanımı       : ${name}
Hesaplanan Alan     : ${area} m²
Rapor Tarihi        : ${new Date().toLocaleDateString('tr-TR')}

1. TOPOĞRAFİK ÖLÇÜM VERİLERİ:
--------------------------------------------------------------------------------
• Ortalama Arazi Eğimi   : %${currentSlopePercent} (${currentSlopeDegrees}°)
• Eğim Kategorisi        : ${topo.category}
• Kot Aralığı (Z_min-max): ${topo.minElevationM} m - ${topo.maxElevationM} m
• Toplam Kot Farkı (ΔZ)  : ${topo.elevationDiffM} metre
• Eğim Yönü / Bakı       : ${topo.aspect} (${topo.aspectDegrees}°)
• Güneşlenme Potansiyeli : ${aspectAnalysis.label} - Verimlilik: ${aspectAnalysis.solarEfficiency}

2. YERLEŞİME UYGUNLUK DEĞERLENDİRMESİ (MEKÂNSAL PLANLAR STANDARDI):
--------------------------------------------------------------------------------
• Uygunluk Kodu          : ${settlement.code} (${settlement.title})
• Yerleşime Uygunluk     : ${settlement.statusLabel}
• Risk Sınıfı            : ${settlement.riskLevel}
• Uygunluk Gerekçesi     : ${settlement.suitabilityDesc}
• İmar Yolu Eğim Durumu  : ${settlement.roadMaxSlope}
• Altyapı Drenaj Durumu  : ${settlement.drainageFeasibility}

3. PLANLI ALANLAR İMAR YÖNETMELİĞİ UYGULAMA KRİTERLERİ:
--------------------------------------------------------------------------------
• Subasman Kotu          : ${settlement.subasmanText}
• Bodrum Kat Kazanımı    : Meyilden dolayı açığa çıkabilecek tahmini kat: ${settlement.uncoveredBasementFloors} Adet
• İstinat Duvarı İhtiyacı: ${settlement.retainingWallType}
• Kazı / Hafriyat Durumu : ${settlement.excavationCost}
• Yasal Mevzuat Referansı: ${settlement.zoningArticle}

4. SONUÇ VE MÜHENDİSLİK TAVSİYESİ:
--------------------------------------------------------------------------------
${topo.zoningNotice}
${settlement.code === 'AJE / UY' || settlement.code === 'ÖA-2'
  ? 'DİKKAT: Yüksek eğim ve şev riski nedeniyle zemin etüdü sırasında şev stabilite kayma dairesi tahkiki yaptırılması ve statik projede istinat-kazık projelendirmesi zorunludur.'
  : 'İnceleme konusu parsel, topoğrafik eğim ve yerleşime uygunluk kriterleri bakımından yapılaşmaya elverişlidir.'}
================================================================================
`.trim();

    navigator.clipboard.writeText(reportText).then(() => {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2200);
    });
  };

  // Export all parcels geotechnical and slope data to CSV
  const handleExportCSV = () => {
    const headers = [
      'Parsel Adı',
      'İl',
      'İlçe',
      'Mahalle',
      'Ada No',
      'Parsel No',
      'Alan (m²)',
      'Yerleşime Uygunluk Kodu',
      'Yerleşime Uygunluk Durumu',
      'Ortalama Eğim (%)',
      'Eğim Açısı (°)',
      'Min Kot (m)',
      'Max Kot (m)',
      'Kot Farkı (m)',
      'Bakı Yönü',
      'Açığa Çıkan Kat Potansiyeli',
      'İstinat Duvarı Tipi',
      'TBDY 2018 Zemin Sınıfı',
      'Vs30 (m/s)',
      'SPT N60',
      'Taşıma Gücü qa (kg/cm²)',
      'Sıvılaşma Riski',
      'Temel Tavsiyesi',
      'Jeolojik Formasyon'
    ];

    const rows = allParcels.map((p) => {
      const s = p.soilClassification || getSoilClassDetails('ZC');
      const t = p.topography || (('geometry' in p ? p.geometry : p.feature) ? calculateParcelTopography(('geometry' in p ? p.geometry : p.feature) as any) : undefined);
      const cad = 'cadastralInfo' in p ? p.cadastralInfo : undefined;
      const slopeVal = t?.avgSlopePercent ?? 0;
      const suitCode = slopeVal <= 5 ? 'UÖ-1' : slopeVal <= 15 ? 'UÖ-2' : slopeVal <= 25 ? 'ÖA-1' : slopeVal <= 40 ? 'ÖA-2' : 'AJE/UY';
      const suitStatus = slopeVal <= 15 ? 'Yerleşime Uygun' : slopeVal <= 40 ? 'Şartlı Uygun / Önlemli' : 'Riskli / AJE Zorunlu';
      const uncoveredFloors = (t?.elevationDiffM ?? 0) >= 7.5 ? 2 : (t?.elevationDiffM ?? 0) >= 2.8 ? 1 : 0;

      return [
        `"${p.name}"`,
        `"${cad?.il || ''}"`,
        `"${cad?.ilce || ''}"`,
        `"${cad?.mahalle || ''}"`,
        `"${cad?.adaNo || p.adaNo || ''}"`,
        `"${cad?.parselNo || p.parselNo || ''}"`,
        p.areaM2,
        `"${suitCode}"`,
        `"${suitStatus}"`,
        t?.avgSlopePercent ?? '',
        t?.avgSlopeDegrees ?? '',
        t?.minElevationM ?? '',
        t?.maxElevationM ?? '',
        t?.elevationDiffM ?? '',
        `"${t?.aspect || ''}"`,
        uncoveredFloors,
        `"${slopeVal <= 5 ? 'Gerek yok' : slopeVal <= 15 ? 'Hafif Çevre Duvarı' : slopeVal <= 25 ? 'Betonarme Konsol' : 'Kazıklı/Ankrajlı'}"`,
        `"${s.soilClass}"`,
        s.vs30,
        s.sptN60,
        s.bearingCapacityKgCm2,
        `"${s.liquefactionRisk}"`,
        `"${s.foundationRecommendation.replace(/"/g, '""')}"`,
        `"${s.geologicalFormation.replace(/"/g, '""')}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Zemin_ve_Egim_Raporu_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900/95 border border-white/15 rounded-3xl shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3.5 border-b border-white/10 bg-slate-900/70 gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-md transition-colors ${
              activeTab === 'slope'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
            }`}>
              {activeTab === 'slope' ? (
                <TrendingUp className="w-5 h-5 stroke-[2.2]" />
              ) : (
                <Mountain className="w-5 h-5 stroke-[2.2]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {activeTab === 'slope' ? 'Topoğrafik Eğim & Yerleşime Uygunluk Raporu' : 'Zemin Türü Tahmini & Jeoteknik Parametreler'}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-white/10 text-slate-300 border border-white/15">
                  {activeTab === 'slope' ? 'Planlı Alanlar İmar Yön.' : 'TBDY 2018'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {activeTab === 'slope'
                  ? 'Arazi eğimi, kot farkı, açığa çıkan bodrum kat ve yerleşime uygunluk analizi'
                  : 'Parsel geometrisi, topoğrafik eğim, kot ve bölgesel jeoloji korelasyonu ile hesaplanmıştır'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {activeTab === 'slope' && (
              <button
                onClick={handleCopySlopeReport}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition active:scale-95"
                title="Resmi Eğim & Yerleşime Uygunluk Raporunu Panoya Kopyala"
              >
                {copiedReport ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                    <span className="hidden sm:inline">Raporu Kopyala</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition active:scale-95"
              title="Tüm parsellerin verilerini CSV olarak indir"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">CSV İndir</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation (Segmented Switcher) */}
        <div className="px-6 py-2.5 border-b border-white/10 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 bg-slate-950/70 border border-white/10 rounded-2xl gap-1">
            <button
              onClick={() => setActiveTab('soil')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
                activeTab === 'soil'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Mountain className="w-3.5 h-3.5" />
              <span>Zemin & Jeoteknik (TBDY 2018)</span>
            </button>

            <button
              onClick={() => setActiveTab('slope')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
                activeTab === 'slope'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Eğim & Yerleşime Uygunluk Raporu</span>
            </button>
          </div>

          {/* Current Parcel Info Kicker */}
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Aktif Parsel: <b className="text-slate-200">{currentParcel?.name || 'Seçili Parsel'}</b></span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>Alan: <b className="text-slate-200">{currentParcel ? currentParcel.areaM2.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : 0} m²</b></span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Parcel Selector (if multiple) */}
          {allParcels.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Parsel:</span>
              <div className="flex gap-1.5">
                {allParcels.map((p) => {
                  const pSoil = p.soilClassification?.soilClass || 'ZC';
                  const isSel = p.id === currentParcel?.id;
                  const pTopo = p.topography;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedId(p.id);
                        onSelectParcel?.(p.id);
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition flex items-center gap-1.5 border ${
                        isSel
                          ? activeTab === 'slope'
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400 font-bold shadow-sm'
                            : 'bg-amber-500/20 text-amber-200 border-amber-400 font-bold shadow-sm'
                          : 'bg-white/5 text-slate-400 hover:text-white border-white/5 hover:bg-white/10'
                      }`}
                    >
                      <span>{p.name}</span>
                      {activeTab === 'slope' ? (
                        <span className="text-[10px] px-1 py-0.2 rounded font-mono font-bold bg-white/10 text-emerald-300">
                          %{pTopo?.avgSlopePercent ?? '—'}
                        </span>
                      ) : (
                        <span className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold ${getSoilBadgeStyle(pSoil)}`}>
                          {pSoil}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= TAB 1: ZEMİN VE JEOTEKNİK (TBDY 2018) ================= */}
          {activeTab === 'soil' && (
            <div className="space-y-6">
              {/* Hero Zemin Sınıfı Kartı */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/90 via-slate-850/80 to-slate-900/90 border border-white/10 p-5 shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {currentParcel?.name || 'Seçili Parsel'} | TBDY 2018 Zemin Sınıfı
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${liqInfo.style}`}>
                        {liqInfo.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight px-3 py-1 rounded-2xl border ${getSoilBadgeStyle(soil.soilClass)}`}>
                        {soil.soilClass}
                      </span>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                          {soil.className}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {soil.lithology}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Formasyon & Lokasyon Özeti */}
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 min-w-[240px] text-xs space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Compass className="w-3 h-3 text-amber-400" />
                      <span>Jeolojik Formasyon</span>
                    </div>
                    <div className="font-semibold text-slate-200">
                      {soil.geologicalFormation}
                    </div>
                    {topo && (
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-white/5 flex items-center justify-between">
                        <span>Ortalama Eğim: <b className="text-slate-200">%{topo.avgSlopePercent}</b></span>
                        <span>Kot Aralığı: <b className="text-slate-200">{topo.minElevationM} - {topo.maxElevationM} m</b></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 6 Parametre Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Vs30 */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Vs,30 Hızı
                  </span>
                  <div className="text-lg font-black font-mono text-emerald-400">
                    {soil.vs30} <span className="text-xs font-normal text-slate-400">m/s</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Aralık: {soil.vs30Range}
                  </div>
                </div>

                {/* SPT N60 */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    SPT (N60)
                  </span>
                  <div className="text-lg font-black font-mono text-blue-400">
                    {soil.sptN60} <span className="text-xs font-normal text-slate-400">darbe/30cm</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Standart Penetrasyon
                  </div>
                </div>

                {/* Güvenli Taşıma Gücü qa */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Taşıma Gücü (qa)
                  </span>
                  <div className="text-lg font-black font-mono text-amber-300">
                    {soil.bearingCapacityKgCm2} <span className="text-xs font-normal text-slate-400">kg/cm²</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    ~{soil.bearingCapacityKPa} kPa (kN/m²)
                  </div>
                </div>

                {/* Spektrum Periyotları TA - TB */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Spektrum (TA / TB)
                  </span>
                  <div className="text-lg font-black font-mono text-indigo-300">
                    {soil.periodTaTb.Ta}s / {soil.periodTaTb.Tb}s
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Köşe Periyotları
                  </div>
                </div>

                {/* Kazı Sınıfı */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Hafriyat / Kazı
                  </span>
                  <div className="text-xs font-bold text-amber-200 mt-1 leading-tight">
                    {soil.excavationClass}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Mekanik Kazı Şartları
                  </div>
                </div>

                {/* Güven Skoru */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Tahmin Doğruluğu
                  </span>
                  <div className="text-lg font-black font-mono text-teal-300">
                    %{soil.estimatedConfidence}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Bölgesel Korelasyon
                  </div>
                </div>
              </div>

              {/* Temel Sistemi Tavsiyesi ve İmar Notu */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                    <HardHat className="w-4 h-4" />
                    <span>Statik & Temel Tasarımı Tavsiyesi</span>
                  </div>
                  <p className="text-sm font-medium text-slate-200 leading-relaxed">
                    {soil.foundationRecommendation}
                  </p>
                  <div className="text-[11px] text-slate-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                    <div>• Zemin sınıfı <b>{soil.soilClass}</b> için üst yapı rijitlik merkezi ile temel kütle merkezi uyumlu olmalıdır.</div>
                    <div>• Taşıma gücü <b>{soil.bearingCapacityKgCm2} kg/cm²</b> baz alınarak konsolidasyon oturma analizi yapılmalıdır.</div>
                    {soil.liquefactionRisk === 'Yüksek' && (
                      <div className="text-rose-400 font-semibold">• Yüksek sıvılaşma potansiyeli nedeniyle zemin iyileştirmesi (jet-grouting veya fore kazık) zorunludur.</div>
                    )}
                  </div>
                </div>

                {/* Manuel Zemin Sınıfı Seçimi (Sondaj / Rapor ile Güncelle) */}
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-300 uppercase tracking-wider">
                      <Layers className="w-4 h-4" />
                      <span>Sondaj Verisi ile Güncelle (Override)</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Saha Raporuna Göre</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Şantiyede yapılan zemin sondajı veya laboratuvar etüt raporu veriniz varsa, zemin sınıfını doğrudan sabitleyebilirsiniz:
                  </p>

                  <div className="grid grid-cols-6 gap-1.5">
                    {(['ZA', 'ZB', 'ZC', 'ZD', 'ZE', 'ZF'] as const).map((sc) => {
                      const isActive = soil.soilClass === sc;
                      return (
                        <button
                          key={sc}
                          onClick={() => {
                            if (currentParcel) {
                              onUpdateSoilClass?.(currentParcel.id, sc);
                            }
                          }}
                          className={`py-2 rounded-xl text-xs font-mono font-black border transition active:scale-95 flex flex-col items-center justify-center ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md font-extrabold ring-2 ring-amber-400/50'
                              : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border-white/10'
                          }`}
                        >
                          <span>{sc}</span>
                          <span className="text-[9px] font-normal opacity-80">{isActive ? 'Seçili' : 'Ayarla'}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-slate-400 italic">
                    * Seçilen zemin sınıfına göre taşıma gücü, Vs30 ve deprem periyotları anında yeniden kalibre edilir.
                  </div>
                </div>
              </div>

              {/* TBDY 2018 Tablo 16.1 Referans Tablosu (Açılır / Kapanır) */}
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-slate-900/40">
                <button
                  onClick={() => setShowTableReference((prev) => !prev)}
                  className="w-full px-4 py-3 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-between text-xs font-bold text-slate-300 transition"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-400" />
                    <span>TBDY 2018 Zemin Sınıfları Tanım Tablosu (Tablo 16.1)</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 underline font-normal">
                    {showTableReference ? 'Gizle' : 'Tabloyu Göster'}
                  </span>
                </button>

                {showTableReference && (
                  <div className="p-4 border-t border-white/10 overflow-x-auto text-xs space-y-2">
                    <table className="w-full text-left border-collapse font-sans">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                          <th className="py-2 px-2">Sınıf</th>
                          <th className="py-2 px-2">Zemin Tanımı</th>
                          <th className="py-2 px-2 font-mono">Vs,30 (m/s)</th>
                          <th className="py-2 px-2 font-mono">N60 (darbe)</th>
                          <th className="py-2 px-2 font-mono">Taş. Gücü (kg/cm²)</th>
                          <th className="py-2 px-2">Sıvılaşma</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        <tr className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2 font-bold text-purple-300 font-mono">ZA</td>
                          <td className="py-2 px-2">Masif sert kayaçlar (Granit, bazalt, masif kalker)</td>
                          <td className="py-2 px-2 font-mono text-emerald-400">&gt; 1500</td>
                          <td className="py-2 px-2 font-mono text-slate-400">&gt; 50 (kaya)</td>
                          <td className="py-2 px-2 font-mono text-amber-300">&gt; 6.0</td>
                          <td className="py-2 px-2 text-emerald-400">Yok</td>
                        </tr>
                        <tr className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2 font-bold text-blue-300 font-mono">ZB</td>
                          <td className="py-2 px-2">Az ayrışmış, orta sağlam kayaçlar (Marn, kumtaşı)</td>
                          <td className="py-2 px-2 font-mono text-emerald-400">760 - 1500</td>
                          <td className="py-2 px-2 font-mono text-slate-400">&gt; 50</td>
                          <td className="py-2 px-2 font-mono text-amber-300">4.0 - 6.0</td>
                          <td className="py-2 px-2 text-emerald-400">Yok</td>
                        </tr>
                        <tr className="hover:bg-white/[0.02] bg-white/[0.02]">
                          <td className="py-2 px-2 font-bold text-emerald-300 font-mono">ZC</td>
                          <td className="py-2 px-2">Çok sıkı çakıl, katı kil veya ayrışmış zayıf kaya</td>
                          <td className="py-2 px-2 font-mono text-emerald-400">360 - 760</td>
                          <td className="py-2 px-2 font-mono text-blue-400">30 - 50</td>
                          <td className="py-2 px-2 font-mono text-amber-300">2.5 - 4.0</td>
                          <td className="py-2 px-2 text-emerald-400">Yok</td>
                        </tr>
                        <tr className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2 font-bold text-amber-300 font-mono">ZD</td>
                          <td className="py-2 px-2">Orta sıkı kum-çakıl veya katı killi zemin tabakaları</td>
                          <td className="py-2 px-2 font-mono text-emerald-400">180 - 360</td>
                          <td className="py-2 px-2 font-mono text-blue-400">15 - 30</td>
                          <td className="py-2 px-2 font-mono text-amber-300">1.5 - 2.5</td>
                          <td className="py-2 px-2 text-amber-400">Düşük / Orta</td>
                        </tr>
                        <tr className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2 font-bold text-orange-300 font-mono">ZE</td>
                          <td className="py-2 px-2">Gevşek kum, yumuşak kil tabakaları (Toplam kalınlık &gt; 3m)</td>
                          <td className="py-2 px-2 font-mono text-rose-400">&lt; 180</td>
                          <td className="py-2 px-2 font-mono text-rose-400">&lt; 15</td>
                          <td className="py-2 px-2 font-mono text-rose-400">0.8 - 1.5</td>
                          <td className="py-2 px-2 text-rose-400 font-bold">Yüksek</td>
                        </tr>
                        <tr className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2 font-bold text-rose-400 font-mono">ZF</td>
                          <td className="py-2 px-2">Sıvılaşabilir, yüksek plastik organik zeminler / bataklık</td>
                          <td className="py-2 px-2 font-mono text-rose-400">Özel Saha Etüdü</td>
                          <td className="py-2 px-2 font-mono text-rose-400">&lt; 10</td>
                          <td className="py-2 px-2 font-mono text-rose-400">&lt; 0.8</td>
                          <td className="py-2 px-2 text-rose-400 font-bold">Kritik</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 2: TOPOĞRAFİK EĞİM & YERLEŞİME UYGUNLUK RAPORU ================= */}
          {activeTab === 'slope' && (
            <div className="space-y-6">
              {/* Hero Eğim & Yerleşime Uygunluk Kartı */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/90 via-slate-850/80 to-slate-900/90 border border-white/10 p-5 shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {currentParcel?.name || 'Seçili Parsel'} | Yerleşime Uygunluk Sınıfı
                      </span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full border ${settlement.badgeBorder}`}>
                        {settlement.code} · {settlement.statusLabel}
                      </span>
                      {simulationSlope !== null && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                          Simülasyon Modu
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-emerald-400">
                          %{currentSlopePercent}
                        </span>
                        <span className="text-base sm:text-lg font-mono text-slate-400 font-semibold">
                          ({currentSlopeDegrees}°)
                        </span>
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                          {settlement.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {settlement.riskLevel}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Kot Farkı ve İrtifa Özet Kartı */}
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 min-w-[250px] text-xs space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Ruler className="w-3 h-3 text-emerald-400" />
                        <span>Arazi Kotları & Fark</span>
                      </span>
                      <span className="font-mono text-emerald-300 font-bold">ΔZ = {topo.elevationDiffM} m</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300 font-medium pt-1 border-t border-white/5">
                      <span>Min. Kot (Z_min):</span>
                      <span className="font-mono font-bold text-white">{topo.minElevationM} m</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300 font-medium">
                      <span>Maks. Kot (Z_max):</span>
                      <span className="font-mono font-bold text-white">{topo.maxElevationM} m</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-white/5">
                      <span>Bakı (Yön):</span>
                      <span className="text-slate-200 font-semibold">{topo.aspect}</span>
                    </div>
                  </div>
                </div>

                {/* Açıklama Metni */}
                <div className="mt-4 pt-3.5 border-t border-white/10 text-xs text-slate-300 leading-relaxed bg-white/[0.02] p-3 rounded-xl border border-white/5">
                  <p>{settlement.suitabilityDesc}</p>
                </div>
              </div>

              {/* 4 Anahtar Gösterge Kartı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Açığa Çıkan Bodrum Kat Potansiyeli */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Bodrum Kat Kazanımı
                    </span>
                    <Building2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-emerald-400">
                      {settlement.uncoveredBasementFloors}
                    </span>
                    <span className="text-xs font-semibold text-slate-300">Kat Açığa Çıkabilir</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Planlı Alanlar İmar Yön. m.20: Meyilden dolayı açığa çıkan katlar iskan edilebilir ve emsale dahil edilmeyebilir.
                  </p>
                </div>

                {/* 2. Subasman Kotu Referansı */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Subasman Kotu (m.14)
                    </span>
                    <Activity className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-xs font-bold text-blue-300 leading-snug">
                    {currentSlopePercent <= 5 ? 'Yol Bordüründen Standart' : 'Tabii Zemin Ortalamasından'}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    {currentSlopePercent <= 5 ? 'Tabii zeminden veya yoldan +0.50m / +1.20m kot verilebilir.' : 'Madde 10 gereği köşe tabii zemin kotlarının aritmetik ortalaması alınır.'}
                  </p>
                </div>

                {/* 3. İstinat Duvarı İhtiyacı */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      İstinat & Şev Güvenliği
                    </span>
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xs font-bold text-amber-300 leading-snug">
                    {currentSlopePercent <= 5 ? 'İstinat Gerekmez' : currentSlopePercent <= 15 ? 'Hafif Çevre Duvarı' : currentSlopePercent <= 25 ? 'Konsol Betonarme İstinat' : 'Kazıklı / Ankrajlı Perde'}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    {settlement.retainingWallType}
                  </p>
                </div>

                {/* 4. Bakı & Pasif Güneşlenme */}
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Bakı & Güneşlenme
                    </span>
                    <Sun className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xs font-bold text-slate-200">
                    {topo.aspect} · {aspectAnalysis.solarEfficiency}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    {aspectAnalysis.solarDesc}
                  </p>
                </div>
              </div>

              {/* İnteraktif Eğim & Senaryo Test Simülatörü */}
              <div className="bg-gradient-to-r from-slate-900/90 via-slate-850/80 to-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 space-y-3 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      İnteraktif Eğim Senaryo Simülatörü
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {simulationSlope !== null && (
                      <button
                        onClick={() => setSimulationSlope(null)}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-300 flex items-center gap-1 transition"
                      >
                        <RotateCcw className="w-3 h-3 text-cyan-400" />
                        <span>Parsel Değerine Sıfırla (%{topo.avgSlopePercent})</span>
                      </button>
                    )}
                    <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Test Eğimi: %{currentSlopePercent} ({currentSlopeDegrees}°)
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300">
                  Parselin ortalama eğimini simüle ederek yerleşime uygunluk kategorisinin, açığa çıkacak katların ve gereken istinat tipinin anlık değişimini izleyin:
                </p>

                <div className="space-y-2 pt-1">
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="0.5"
                    value={currentSlopePercent}
                    onChange={(e) => setSimulationSlope(parseFloat(e.target.value))}
                    className="w-full accent-emerald-400 h-2 bg-slate-750 rounded-lg cursor-pointer transition"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>%0 (Düz)</span>
                    <span className="text-emerald-400 font-bold">%5 (UÖ-1)</span>
                    <span className="text-blue-400 font-bold">%15 (UÖ-2)</span>
                    <span className="text-amber-400 font-bold">%25 (ÖA-1)</span>
                    <span className="text-orange-400 font-bold">%40 (ÖA-2)</span>
                    <span className="text-rose-400 font-bold">%50+ (AJE)</span>
                  </div>
                </div>
              </div>

              {/* İmar Uygulama ve Altyapı Detayları Matrisi */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sol Kart: İmar Mevzuatı & Yapılaşma Koşulları */}
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span>İmar Mevzuatı & Yapılaşma İlkeleri</span>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Subasman ve Kot Referansı:</span>
                      <p className="text-slate-200 leading-snug">{settlement.subasmanText}</p>
                    </div>

                    <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Bodrum Katlar & Emsal (Madde 20):</span>
                      <p className="text-slate-200 leading-snug">
                        Kot farkı nedeniyle açığa çıkan katlar emsale dahil edilmeden otopark, sığınak veya konut/işyeri olarak projelendirilebilir.
                      </p>
                    </div>

                    <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">İmar Yolu Eğimi ve Taşıt Ulaşımı:</span>
                      <p className="text-slate-200 leading-snug">{settlement.roadMaxSlope}</p>
                    </div>
                  </div>
                </div>

                {/* Sağ Kart: Altyapı, İstinat & Mimari Yönelim */}
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-300 uppercase tracking-wider">
                    <HardHat className="w-4 h-4 text-blue-400" />
                    <span>Mühendislik Tedbirleri & Şev Tahkiki</span>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">İstinat Duvarı & Barbakan Kriteri:</span>
                      <p className="text-slate-200 leading-snug">{settlement.retainingWallType}</p>
                    </div>

                    <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Yağmursuyu ve Atıksu Drenajı:</span>
                      <p className="text-slate-200 leading-snug">{settlement.drainageFeasibility}</p>
                    </div>

                    <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Mimari Güneşlenme & Mikroiklim Tavsiyesi:</span>
                      <p className="text-slate-200 leading-snug">{aspectAnalysis.architectureRec}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mekânsal Planlar & İller Bankası Eğim Standartları Referans Tablosu */}
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-slate-900/40">
                <button
                  onClick={() => setShowSlopeReference((prev) => !prev)}
                  className="w-full px-4 py-3 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-between text-xs font-bold text-slate-300 transition"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-400" />
                    <span>Mekânsal Planlar Yapım Yön. & İller Bankası Eğim Kriterleri Tablosu</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 underline font-normal">
                    {showSlopeReference ? 'Gizle' : 'Tabloyu Göster'}
                  </span>
                </button>

                {showSlopeReference && (
                  <div className="p-4 border-t border-white/10 overflow-x-auto text-xs space-y-2">
                    <table className="w-full text-left border-collapse font-sans">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                          <th className="py-2 px-2">Eğim Aralığı (%)</th>
                          <th className="py-2 px-2 font-mono">Derece (°)</th>
                          <th className="py-2 px-2">Uygunluk Kodu</th>
                          <th className="py-2 px-2">Yerleşim Durumu</th>
                          <th className="py-2 px-2">İmar & Altyapı Kararı</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        <tr className={`hover:bg-white/[0.02] ${currentSlopePercent <= 5 ? 'bg-emerald-500/10 font-bold' : ''}`}>
                          <td className="py-2 px-2 font-mono text-emerald-400">%0 - %5</td>
                          <td className="py-2 px-2 font-mono text-slate-400">0° - 2.9°</td>
                          <td className="py-2 px-2 font-bold text-emerald-300 font-mono">UÖ-1</td>
                          <td className="py-2 px-2 text-emerald-400">Uygun Alan (İdeal)</td>
                          <td className="py-2 px-2">Standart temel ve subasman; en ekonomik altyapı maliyeti</td>
                        </tr>
                        <tr className={`hover:bg-white/[0.02] ${currentSlopePercent > 5 && currentSlopePercent <= 15 ? 'bg-blue-500/10 font-bold' : ''}`}>
                          <td className="py-2 px-2 font-mono text-blue-400">%5 - %15</td>
                          <td className="py-2 px-2 font-mono text-slate-400">2.9° - 8.5°</td>
                          <td className="py-2 px-2 font-bold text-blue-300 font-mono">UÖ-2</td>
                          <td className="py-2 px-2 text-blue-400">Uygun Alan (Doğal Drenaj)</td>
                          <td className="py-2 px-2">Göllenme riski yok; hafif kademelendirme yapılabilir</td>
                        </tr>
                        <tr className={`hover:bg-white/[0.02] ${currentSlopePercent > 15 && currentSlopePercent <= 25 ? 'bg-amber-500/10 font-bold' : ''}`}>
                          <td className="py-2 px-2 font-mono text-amber-400">%15 - %25</td>
                          <td className="py-2 px-2 font-mono text-slate-400">8.5° - 14.0°</td>
                          <td className="py-2 px-2 font-bold text-amber-300 font-mono">ÖA-1</td>
                          <td className="py-2 px-2 text-amber-400">Önlemli Alan (Orta Eğim)</td>
                          <td className="py-2 px-2">Kademeli temel, betonarme istinat; meyilden bodrum kat kazanımı</td>
                        </tr>
                        <tr className={`hover:bg-white/[0.02] ${currentSlopePercent > 25 && currentSlopePercent <= 40 ? 'bg-orange-500/10 font-bold' : ''}`}>
                          <td className="py-2 px-2 font-mono text-orange-400">%25 - %40</td>
                          <td className="py-2 px-2 font-mono text-slate-400">14.0° - 21.8°</td>
                          <td className="py-2 px-2 font-bold text-orange-300 font-mono">ÖA-2</td>
                          <td className="py-2 px-2 text-orange-400">Yüksek Önlemli Alan</td>
                          <td className="py-2 px-2">Şev stabilite tahkiki zorunlu; ankrajlı istinat ve basamaklı kütle</td>
                        </tr>
                        <tr className={`hover:bg-white/[0.02] ${currentSlopePercent > 40 ? 'bg-rose-500/10 font-bold' : ''}`}>
                          <td className="py-2 px-2 font-mono text-rose-400">&gt; %40</td>
                          <td className="py-2 px-2 font-mono text-slate-400">&gt; 21.8°</td>
                          <td className="py-2 px-2 font-bold text-rose-300 font-mono">AJE / UY</td>
                          <td className="py-2 px-2 text-rose-400 font-bold">Ayrıntılı Etüt / Riskli</td>
                          <td className="py-2 px-2">Özel heyelan raporu zorunlu; tercihen yeşil/ağaçlandırılacak alan</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3.5 border-t border-white/10 bg-slate-900/80 gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              {activeTab === 'slope'
                ? 'Mevzuat: Planlı Alanlar İmar Yönetmeliği (m.10/14/20) & Mekânsal Planlar Yapım Yönetmeliği'
                : 'Mevzuat: Türkiye Bina Deprem Yönetmeliği (TBDY 2018) Tablo 16.1 & Madde 16.4'}
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {activeTab === 'soil' ? (
              <button
                onClick={() => setActiveTab('slope')}
                className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition active:scale-95 flex items-center gap-1.5"
              >
                <span>Eğim Raporunu İncele</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('soil')}
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition active:scale-95 flex items-center gap-1.5"
              >
                <span>Zemin Raporuna Geç</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition active:scale-95"
            >
              Tamam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
