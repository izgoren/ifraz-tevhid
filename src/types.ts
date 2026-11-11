import type { Feature, Polygon, MultiPolygon, LineString } from 'geojson';

export type ParcelGeometry = Feature<Polygon | MultiPolygon>;

export interface LoadedCadastralParcel {
  id: string;
  fileId: string;
  fileName: string;
  name: string;
  geometry: ParcelGeometry;
  cadastralInfo: {
    il: string;
    ilce: string;
    mahalle: string;
    adaNo: string;
    parselNo: string;
    mevkii?: string;
    nitelik?: string;
    tapuAlaniM2?: number;
    source?: 'file' | 'location' | 'manual';
  };
  rawProperties: Record<string, string>;
  areaM2: number;
  isActive: boolean;
  soilClassification?: SoilClassification; // Parsel zemin türü ve jeoteknik tahmin verisi
  topography?: ParcelTopography; // Parsel topoğrafik eğim, kot ve yerleşime uygunluk verisi
}

export interface LoadedCadastralFile {
  id: string;
  fileName: string;
  uploadTime: string;
  fileSize?: number;
  parcels: LoadedCadastralParcel[];
  roadLines: Feature<LineString>[];
}

export interface SoilClassification {
  soilClass: 'ZA' | 'ZB' | 'ZC' | 'ZD' | 'ZE' | 'ZF';
  className: string;
  geologicalFormation: string;
  lithology: string;
  vs30: number;
  vs30Range: string;
  sptN60: number;
  bearingCapacityKPa: number;
  bearingCapacityKgCm2: number;
  liquefactionRisk: 'Yok' | 'Düşük' | 'Orta' | 'Yüksek';
  periodTaTb: { Ta: number; Tb: number };
  foundationRecommendation: string;
  excavationClass: 'Küskülük (Orta Zor)' | 'Yumuşak / Kazılabilir' | 'Sert Kaya (Kırıcı Gerekir)' | 'Çok Sert Kaya (Patlatma/Riper)';
  tbdyReference: string;
  estimatedConfidence: number;
}

export interface ParcelTopography {
  avgSlopePercent: number;
  avgSlopeDegrees: number;
  minElevationM: number;
  maxElevationM: number;
  elevationDiffM: number;
  aspect: string;
  aspectDegrees: number;
  category: string;
  complianceStatus: 'uygun' | 'sartli_uygun' | 'ozel_onlem';
  zoningNotice: string;
}

export interface GeneratedParcel {
  id: string;
  name: string;
  feature: ParcelGeometry;
  areaM2: number;
  frontageM: number;
  rearWidthM?: number; // Bitiş (Arka) Sınır Genişliği (metre, min. 10m kuralı)
  depthM: number;
  isValid: boolean;
  validationReasons: string[];
  rowGroup?: 'single' | 'top' | 'bottom';
  topography?: ParcelTopography; // Topografik eğim, kot farkı ve imar uyumluluğu
  soilClassification?: SoilClassification; // Zemin türü ve jeoteknik parametreleri
  
  // Dynamic Parcel Attributes (Öz Nitelik Bilgileri)
  adaNo?: string;
  parselNo?: string;
  ownerName?: string;
  notes?: string;
  manualFrontageM?: number; // Kullanıcı tarafından manuel girilen / uyumlandırılan cephe
  manualRearWidthM?: number; // Kullanıcı tarafından manuel girilen bitiş genişliği
}

export interface SubdivisionConfig {
  pieceCount: number;
  rotateAngle: number; // 0 to 180 degrees
  isDoubleRow: boolean; // Tek vs Çift Sıra İfraz
  roadFrontageEdge: 'auto' | 'north' | 'south' | 'east' | 'west' | 'customRoad'; // Yol Cephesi Hizalaması
  selectedRoadFrontages: ('north' | 'south' | 'east' | 'west')[]; // Çoklu Yol Cephesi Seçimi (Köşe Başı Parseller)
  frontageValidationMode: 'all' | 'sum'; // 'all': Tüm seçili cepheler ayrı ayrı min. cepheyi sağlamalı, 'sum': Toplam cephe sağlamalı
  axisPosition: number; // 10 to 90 %
  isSplitAngles: boolean;
  commonAngle: number; // -90 to 90
  leftAngle: number; // -90 to 90
  rightAngle: number; // -90 to 90
  
  // Yol Sınırı ve İfraz Cephesi Manuel Tam Uyumluluk
  manualRoadCompliance: boolean; // Manuel Yol Sınırı & İfraz Cephesi Tam Uyumluluk Modu
  roadSnapToleranceM: number; // Yol sınırı algılama & kenetlenme toleransı (metre, örn: 20m)
  autoPerpendicularToRoad: boolean; // Yol çizgisine otomatik dik açı kenetlenmesi
  showRoadFrontageHighlight?: boolean; // Yol cephesi kenarlarını haritada renkli vurgula
  selectedFrontageEdgeIndices?: number[]; // Çoklu kırık yol cephesi kenar indeksleri
  
  // Yamuk Alanlar & Yol Cephesine Göre Otomatik Bölümleme
  subdivisionMethod?: 'equalArea' | 'trapezoidFrontage'; // Bölümleme Yöntemi: Eşit Alan vs Yamuk / Cephe Odaklı
  frontageDistanceM?: number; // Parsel başına hedeflenen yol cephesi mesafesi (metre, min 10m)
  isFixedFrontage?: boolean; // Yol cephesi mesafesini girilen değere göre sabitle
  selectedFrontageEdgeIndex?: number; // Seçili yol cephesi kenar indeksi
  westEdgeIndex?: number; // Parsel Batı kenar indeksi
  eastEdgeIndex?: number; // Parsel Doğu kenar indeksi
  leftSideEdgeIndex?: number; // Sol / Batı kenar indeksi (alias)
  rightSideEdgeIndex?: number; // Sağ / Doğu kenar indeksi (alias)
  parallelReferenceMode?: 'average' | 'bisector' | 'west' | 'east' | 'interpolated' | 'left' | 'right' | 'perpendicular'; // Bölme Açısı Referansı (Açı Ortaj / Açıortay, Paralel)
  isNaturalContour?: boolean; // Parselin doğal şekline göre şekillenen kırıklı hat (morfing)
  edgeSelectionMode?: 'none' | 'road' | 'left' | 'right'; // Haritadan doğrudan kenar seçim modu
  
  // Constraints (İmar Mevzuatı Kısıtları: Yol Cephesi & Bitiş Min. 10m, Eğim Kontrolü)
  checkMinFrontage: boolean;
  minFrontageVal: number; // meters (min. 10m)
  checkMinRearWidth?: boolean; // Bitiş (arka) sınır min 10m kontrolü
  minRearWidthVal?: number; // meters (min. 10m)
  checkMaxDepth: boolean;
  maxDepthVal: number; // meters
  checkMinArea: boolean;
  minAreaVal: number; // m²
  checkMaxSlope?: boolean; // Topografik eğim kontrolü
  maxSlopeVal?: number; // % cinsinden maksimum izin verilen eğim (örn: 30%)

  // İl & İlçe İmar Mevzuatı Seçimi
  selectedProvince: string;
  selectedDistrict: string;
  selectedZoneType: string;
  frontGardenVal: number; // meters (Ön bahçe çekme)
  sideGardenVal: number; // meters (Yan bahçe çekme)
  
  // Bilinmeyen / İlçe 1/1000 Plan Notları Manuel Girdi (Override)
  manualPlanNoteTaks?: number;
  manualPlanNoteKaks?: number;
  manualPlanNoteHmax?: string;
}

export interface MapSettings {
  tileProvider: 'googleHybrid' | 'googleSatellite' | 'osm';
  showFill: boolean;
  showNames: boolean;
  showAreas: boolean;
  showEdgeLengths: boolean;
  showCadastre?: boolean; // Balastro / Kadastro parsel sınırları görünürlüğü
  showSlopeInfo?: boolean; // Eğim ve topoğrafik yükseklik bilgisi görünürlüğü
  showSoilInfo?: boolean; // Zemin türü ve taşıma gücü bilgisi görünürlüğü
  enableDragMerge: boolean;
  selectModeMerge: boolean;
  cadModeActive: boolean; // CAD ekranı gibi vertex ve köşe düzenleme modu
  cadActiveTool: 'select' | 'vertex' | 'slice';
  showRoadFrontageHighlight?: boolean;
  theme: 'dark' | 'light'; // Gece / Gündüz modu
  uiOpacity: number; // 30 - 100 (%) panel saydamlığı
  uiScale?: number; // 90 - 130 (%) buton ve yazı ölçeklendirme / büyütme
  parcelFillOpacity: number; // 0 - 80 (%) parsel dolgu saydamlığı
}

export interface StatsSummary {
  totalAreaM2: number;
  parcelCount: number;
  validCount: number;
  invalidCount: number;
  minAreaM2: number;
  maxAreaM2: number;
  avgAreaM2: number;
  stdDevM2: number;
  complianceRate: number; // percentage
}

export interface UndoRedoState {
  pieces: GeneratedParcel[];
  mainPolygon: ParcelGeometry | null;
  config: SubdivisionConfig;
  description: string;
}

