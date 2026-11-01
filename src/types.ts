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
}

export interface LoadedCadastralFile {
  id: string;
  fileName: string;
  uploadTime: string;
  fileSize?: number;
  parcels: LoadedCadastralParcel[];
  roadLines: Feature<LineString>[];
}

export interface GeneratedParcel {
  id: string;
  name: string;
  feature: ParcelGeometry;
  areaM2: number;
  frontageM: number;
  depthM: number;
  isValid: boolean;
  validationReasons: string[];
  rowGroup?: 'single' | 'top' | 'bottom';
  
  // Dynamic Parcel Attributes (Öz Nitelik Bilgileri)
  adaNo?: string;
  parselNo?: string;
  ownerName?: string;
  notes?: string;
  manualFrontageM?: number; // Kullanıcı tarafından manuel girilen / uyumlandırılan cephe
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
  
  // Constraints (İmar Mevzuatı Kısıtları)
  checkMinFrontage: boolean;
  minFrontageVal: number; // meters
  checkMaxDepth: boolean;
  maxDepthVal: number; // meters
  checkMinArea: boolean;
  minAreaVal: number; // m²

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
  enableDragMerge: boolean;
  selectModeMerge: boolean;
  cadModeActive: boolean; // CAD ekranı gibi vertex ve köşe düzenleme modu
  cadActiveTool: 'select' | 'vertex' | 'slice';
  showRoadFrontageHighlight?: boolean;
  theme: 'dark' | 'light'; // Gece / Gündüz modu
  uiOpacity: number; // 30 - 100 (%) panel saydamlığı
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

