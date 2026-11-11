import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Feature, LineString } from 'geojson';
import * as turf from '@turf/turf';
import { MapContainer } from './components/MapContainer';
import { ControlPanel } from './components/ControlPanel';
import { PrintReportModal } from './components/PrintReportModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CadastralAttributeDrawer } from './components/CadastralAttributeDrawer';
import { SoilAnalysisModal } from './components/SoilAnalysisModal';
import { NewDrawnParcelModal } from './components/NewDrawnParcelModal';
import { estimateSoilClassification, getSoilClassDetails } from './utils/soilEstimation';
import { calculateParcelTopography } from './utils/topographicSlope';
import { Info } from 'lucide-react';
import {
  GeneratedParcel,
  MapSettings,
  ParcelGeometry,
  StatsSummary,
  SubdivisionConfig,
  UndoRedoState,
  LoadedCadastralFile,
  LoadedCadastralParcel
} from './types';
import {
  mergeParcels,
  runSubdivisionProcess,
  validateParcel,
  sliceParcelWithLine,
  calculatePerpendicularRoadAngle,
  snapParcelsToRoadBoundary,
  getMainPolygonEdges,
  ParcelEdge,
  calculateMultiEdgeFrontage
} from './utils/geometryOptimizer';
import { parseKMLToGeoJSON } from './utils/kmlParser';
import { exportToCSV, exportToGeoJSON, exportToKML, triggerFileDownload } from './utils/kmlExporter';
import { CadastralInfo, deriveCadastralLocation } from './utils/cadastralLocation';

const DEFAULT_CONFIG: SubdivisionConfig = {
  pieceCount: 0,
  rotateAngle: 0,
  isDoubleRow: false,
  roadFrontageEdge: 'auto',
  selectedRoadFrontages: [],
  frontageValidationMode: 'all',
  axisPosition: 50,
  isSplitAngles: false,
  commonAngle: 0,
  leftAngle: 0,
  rightAngle: 0,
  checkMinFrontage: true,
  minFrontageVal: 10,
  checkMinRearWidth: true,
  minRearWidthVal: 10,
  checkMaxDepth: false,
  maxDepthVal: 40,
  checkMinArea: true,
  minAreaVal: 400,
  selectedProvince: 'İstanbul',
  selectedDistrict: 'Kadıköy',
  selectedZoneType: 'ayrik_konut',
  frontGardenVal: 5,
  sideGardenVal: 3,
  manualRoadCompliance: false,
  roadSnapToleranceM: 20,
  autoPerpendicularToRoad: true,
  showRoadFrontageHighlight: true,
  selectedFrontageEdgeIndices: [],
  subdivisionMethod: 'equalArea',
  frontageDistanceM: 15,
  isFixedFrontage: false,
  selectedFrontageEdgeIndex: 0,
  westEdgeIndex: undefined,
  eastEdgeIndex: undefined,
  leftSideEdgeIndex: undefined,
  rightSideEdgeIndex: undefined,
  parallelReferenceMode: 'average',
  isNaturalContour: true
};

const DEFAULT_MAP_SETTINGS: MapSettings = {
  tileProvider: 'googleHybrid',
  showFill: true,
  showNames: true,
  showAreas: true,
  showEdgeLengths: true,
  showCadastre: true,
  showSlopeInfo: true,
  showSoilInfo: true,
  enableDragMerge: false,
  selectModeMerge: true,
  cadModeActive: false,
  cadActiveTool: 'vertex',
  theme: 'dark',
  uiOpacity: 78,
  uiScale: 100,
  parcelFillOpacity: 45
};

const getStoredMapSettings = (): MapSettings => {
  try {
    const raw = localStorage.getItem('ifraz_user_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.mapSettings) {
        return { ...DEFAULT_MAP_SETTINGS, ...parsed.mapSettings, enableDragMerge: false };
      }
    }
  } catch (e) {}
  return DEFAULT_MAP_SETTINGS;
};

export default function App() {
  const [mainPolygon, setMainPolygon] = useState<ParcelGeometry | null>(null);
  const [roadLines, setRoadLines] = useState<Feature<LineString>[]>([]);
  const [config, setConfig] = useState<SubdivisionConfig>(DEFAULT_CONFIG);
  const [mapSettings, setMapSettings] = useState<MapSettings>(getStoredMapSettings);
  const [parcels, setParcels] = useState<GeneratedParcel[]>([]);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isSettingsSaved, setIsSettingsSaved] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Lütfen başlamak için KML/GeoJSON kadastro dosyası yükleyin veya harita üzerinde parsel çizin.'
  );

  // Real Cadastral & Location Metadata (İl, İlçe, Mahalle, Ada, Parsel)
  const [cadastralInfo, setCadastralInfo] = useState<CadastralInfo>({
    il: 'Ankara',
    ilce: 'Gölbaşı',
    mahalle: 'İncek / Hacılar',
    adaNo: '1042',
    parselNo: '18',
    mevkii: 'Köy İçi',
    nitelik: 'Arsa / Tarla'
  });

  // Multi-KML Files & Loaded Parcels Management
  const [loadedFiles, setLoadedFiles] = useState<LoadedCadastralFile[]>([]);
  const [activeParcelId, setActiveParcelId] = useState<string | null>(null);
  const [isAttributeDrawerOpen, setIsAttributeDrawerOpen] = useState<boolean>(false);

  // Soil Analysis Modal State
  const [isSoilModalOpen, setIsSoilModalOpen] = useState<boolean>(false);
  const [soilModalParcelId, setSoilModalParcelId] = useState<string | null>(null);
  const [soilModalInitialTab, setSoilModalInitialTab] = useState<'soil' | 'slope'>('soil');

  // All parcels across all loaded KML files
  const allLoadedParcels = useMemo(() => {
    return loadedFiles.flatMap((f) => f.parcels);
  }, [loadedFiles]);

  // Secondary parcels (all loaded parcels that are not currently active in mainPolygon)
  const secondaryParcels = useMemo(() => {
    return allLoadedParcels.filter((p) => p.id !== activeParcelId);
  }, [allLoadedParcels, activeParcelId]);

  // Multi-edge Road Frontage Selection States ("Çoklu Kırık")
  const [isSelectingFrontageEdge, setIsSelectingFrontageEdge] = useState<boolean>(false);
  const [edgeSelectionMode, setEdgeSelectionMode] = useState<'none' | 'road' | 'left' | 'right'>('none');
  const [selectedFrontageEdgeIndices, setSelectedFrontageEdgeIndices] = useState<number[]>([]);

  // Active Map Drawing Tool (polygon/line/delete)
  const [activeDrawTool, setActiveDrawTool] = useState<'polygon' | 'line' | 'delete' | null>(null);

  // Pending Drawn Polygon for Naming & Additional Parcel Placement
  const [pendingDrawnPolygon, setPendingDrawnPolygon] = useState<ParcelGeometry | null>(null);
  const [isDrawnParcelModalOpen, setIsDrawnParcelModalOpen] = useState<boolean>(false);

  // Derived edges of the main cadastral parcel
  const mainPolygonEdges = useMemo(() => getMainPolygonEdges(mainPolygon), [mainPolygon]);

  // Tracks whether the current parcels contain manual CAD edits so we don't clobber them
  const isCadDirtyRef = useRef<boolean>(false);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState<UndoRedoState[]>([]);
  const [redoStack, setRedoStack] = useState<UndoRedoState[]>([]);

  // Push current state to Undo Stack before destructive modifications
  const pushUndoState = useCallback(
    (description: string) => {
      setUndoStack((prev) => [
        ...prev,
        {
          pieces: JSON.parse(JSON.stringify(parcels)),
          mainPolygon: mainPolygon ? JSON.parse(JSON.stringify(mainPolygon)) : null,
          config: { ...config },
          description
        }
      ]);
      setRedoStack([]); // Clear redo stack on new action
    },
    [parcels, mainPolygon, config]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));

    if (previous) {
      setRedoStack((prev) => [
        ...prev,
        {
          pieces: JSON.parse(JSON.stringify(parcels)),
          mainPolygon: mainPolygon ? JSON.parse(JSON.stringify(mainPolygon)) : null,
          config: { ...config },
          description: 'Undo State'
        }
      ]);

      setParcels(previous.pieces);
      if (previous.mainPolygon) setMainPolygon(previous.mainPolygon);
      setConfig(previous.config);
      setSelectedParcelIds([]);
      setStatusMessage(`Geri Alındı: ${previous.description}`);
    }
  }, [undoStack, parcels, mainPolygon, config]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));

    if (next) {
      setUndoStack((prev) => [
        ...prev,
        {
          pieces: JSON.parse(JSON.stringify(parcels)),
          mainPolygon: mainPolygon ? JSON.parse(JSON.stringify(mainPolygon)) : null,
          config: { ...config },
          description: 'Redo State'
        }
      ]);

      setParcels(next.pieces);
      if (next.mainPolygon) setMainPolygon(next.mainPolygon);
      setConfig(next.config);
      setSelectedParcelIds([]);
      setStatusMessage('İleri Alındı.');
    }
  }, [redoStack, parcels, mainPolygon, config]);

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Execute Subdivision when Main Polygon, Config or RoadLines Change
  useEffect(() => {
    if (!mainPolygon) return;

    // If piece count is 0, user is in unsubdivided mode
    if (!config.pieceCount || config.pieceCount <= 0) {
      setParcels([]);
      setSelectedParcelIds([]);
      isCadDirtyRef.current = false;
      setStatusMessage(
        `İfrazsız mod (Parça sayısı: 0). Parça sayısını seçerek ifraz işlemini başlatabilirsiniz (${cadastralInfo.il} / ${cadastralInfo.ilce} • Ada: ${cadastralInfo.adaNo}, Parsel: ${cadastralInfo.parselNo}).`
      );
      return;
    }

    try {
      const generated = runSubdivisionProcess(mainPolygon, config, roadLines);
      setParcels(generated);
      setSelectedParcelIds([]);
      isCadDirtyRef.current = false;

      const invalidCount = generated.filter((p) => !p.isValid).length;
      if (generated.length === 1) {
        setStatusMessage(
          `1 Parsel (Tek Parsel • Ada: ${cadastralInfo.adaNo}, Parsel: ${cadastralInfo.parselNo} • ${generated[0]?.areaM2} m²).`
        );
      } else if (invalidCount > 0) {
        setStatusMessage(
          `${generated.length} Parsel Oluşturuldu (${invalidCount} adedi asgari cephe/alan sınırını sağlamıyor).`
        );
      } else {
        setStatusMessage(
          `${generated.length} Adet İfraz Parseli Hesaplandı (${cadastralInfo.il} / ${cadastralInfo.ilce} • Ada: ${cadastralInfo.adaNo}, Parsel: ${cadastralInfo.parselNo}).`
        );
      }
    } catch (e: any) {
      console.error('İfraz Hatası:', e);
      setStatusMessage(`Hesaplama Hatası: ${e.message}`);
    }
  }, [mainPolygon, config, roadLines, cadastralInfo]);

  // Recalculate / Update Subdivision explicitly
  const handleRecalculate = useCallback(() => {
    if (!mainPolygon) {
      setStatusMessage('Önce haritada bir parsel çizin veya KML dosyası yükleyin.');
      return;
    }
    pushUndoState('İfraz Güncellendi');
    try {
      if (!config.pieceCount || config.pieceCount <= 0) {
        setParcels([]);
        setSelectedParcelIds([]);
        isCadDirtyRef.current = false;
        setStatusMessage('İfrazsız moddasınız. Parça sayısını belirleyerek ifrazı başlatabilirsiniz.');
        return;
      }
      const generated = runSubdivisionProcess(mainPolygon, config, roadLines);
      setParcels(generated);
      setSelectedParcelIds([]);
      isCadDirtyRef.current = false;
      setStatusMessage(`İfraz parselleri güncellendi (${generated.length} parsel).`);
    } catch (e: any) {
      console.error('İfraz Güncelleme Hatası:', e);
      setStatusMessage(`Hesaplama Hatası: ${e.message}`);
    }
  }, [mainPolygon, config, roadLines, pushUndoState]);

  // Toggle Selection of Parcels
  const handleParcelSelectToggle = useCallback((parcelId: string) => {
    setSelectedParcelIds((prev) =>
      prev.includes(parcelId) ? prev.filter((id) => id !== parcelId) : [...prev, parcelId]
    );
  }, []);

  // Multi-Parcel Tevhid (Merge) Action
  const handleMergeSelected = useCallback(() => {
    if (selectedParcelIds.length < 2) return;

    const parcelsToMerge = parcels.filter((p) => selectedParcelIds.includes(p.id));
    if (parcelsToMerge.length < 2) return;

    pushUndoState(`Tevhid (${parcelsToMerge.length} Parsel)`);

    try {
      const { updatedParcels, mergedParcel } = mergeParcels(parcelsToMerge, parcels);
      setParcels(updatedParcels);
      setSelectedParcelIds([]);
      isCadDirtyRef.current = true;
      setStatusMessage(
        `Tevhid İşlemi Başarılı! ${parcelsToMerge.length} parsel birleştirildi. Yeni Parsel Alanı: ${mergedParcel.areaM2.toFixed(1)} m²`
      );
    } catch (e: any) {
      alert(`Tevhid Hatası: ${e.message}`);
    }
  }, [selectedParcelIds, parcels, pushUndoState]);

  // Drag-and-Drop Tevhid Handler
  const handleDragMerge = useCallback(
    (draggedIdx: number, targetIdx: number) => {
      const p1 = parcels[draggedIdx];
      const p2 = parcels[targetIdx];
      if (!p1 || !p2) return;

      pushUndoState(`Sürükle-Bırak Tevhit (${p1.name} + ${p2.name})`);

      try {
        const { updatedParcels, mergedParcel } = mergeParcels([p1, p2], parcels);
        setParcels(updatedParcels);
        setSelectedParcelIds([]);
        isCadDirtyRef.current = true;
        setStatusMessage(`Sürükle-Bırak Tevhid Başarılı! Yeni Parsel: ${mergedParcel.areaM2.toFixed(1)} m²`);
      } catch (e: any) {
        console.error('Drag Merge Error:', e);
      }
    },
    [parcels, pushUndoState]
  );

  // Dynamic Parcel Attributes Update Handler
  const handleUpdateParcelAttributes = useCallback(
    (parcelId: string, updatedFields: Partial<GeneratedParcel>) => {
      setParcels((prev) =>
        prev.map((p) => {
          if (p.id === parcelId) {
            const updated = { ...p, ...updatedFields };
            if (updatedFields.areaM2 !== undefined && updatedFields.areaM2 !== p.areaM2) {
              const { isValid, frontageM, depthM, rearWidthM, reasons } = validateParcel(updated.feature, updated.areaM2, config, roadLines);
              updated.isValid = isValid;
              updated.frontageM = frontageM;
              updated.rearWidthM = rearWidthM;
              updated.depthM = depthM;
              updated.validationReasons = reasons;
            }
            return updated;
          }
          return p;
        })
      );
      setStatusMessage('Parsel öz nitelik bilgileri güncellendi.');
    },
    [config, roadLines]
  );

  // CAD Mode: Handle Vertex / Boundary updates from Leaflet-Geoman
  const handleParcelGeometryUpdated = useCallback(
    (parcelId: string, updatedFeature: ParcelGeometry) => {
      pushUndoState('CAD Köşe Düzenlemesi');
      isCadDirtyRef.current = true;

      const newAreaM2 = Math.round(turf.area(updatedFeature) * 10) / 10;
      const { isValid, frontageM, depthM, rearWidthM, reasons } = validateParcel(
        updatedFeature,
        newAreaM2,
        config,
        roadLines
      );

      setParcels((prev) =>
        prev.map((p) => {
          if (p.id === parcelId) {
            return {
              ...p,
              feature: updatedFeature,
              areaM2: newAreaM2,
              frontageM,
              rearWidthM,
              depthM,
              isValid,
              validationReasons: reasons,
              notes: (p.notes ? p.notes + ' | ' : '') + 'CAD Köşe Düzeltmesi Yapıldı'
            };
          }
          return p;
        })
      );

      setStatusMessage(`CAD Düzenleme: Parsel köşeleri güncellendi (${newAreaM2.toFixed(1)} m²).`);
    },
    [config, roadLines, pushUndoState]
  );

  // CAD Mode: Handle Slicing Parcel with Drawn Line
  const handleParcelSliced = useCallback(
    (parcelId: string, sliceLine: Feature<LineString>) => {
      const target = parcels.find((p) => p.id === parcelId);
      if (!target) return;

      pushUndoState(`CAD Bıçağı ile Bölme (${target.name})`);

      const result = sliceParcelWithLine(target, sliceLine, config, roadLines);
      if (result) {
        const [part1, part2] = result;
        setParcels((prev) => {
          const idx = prev.findIndex((p) => p.id === parcelId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated.splice(idx, 1, part1, part2);
          return updated;
        });

        isCadDirtyRef.current = true;
        setStatusMessage(`CAD Bıçağı Başarılı: ${target.name} iki parsele bölündü (${part1.areaM2.toFixed(1)} m² ve ${part2.areaM2.toFixed(1)} m²).`);
      } else {
        setStatusMessage('Kesim çizgisi parsel sınırlarını tam olarak kesmedi. Lütfen parseli boydan boya kesen bir çizgi çizin.');
      }
    },
    [parcels, config, roadLines, pushUndoState]
  );

  // Road Frontage Multi-Edge Selection Toggle
  const handleToggleSelectFrontageEdge = useCallback(() => {
    setIsSelectingFrontageEdge((prev) => {
      const next = !prev;
      if (next) {
        setStatusMessage(
          'Parselin yol kenarlarına (kırıklarına) harita üzerinden tıklayarak çoklu yol cephesi belirleyin.'
        );
      }
      return next;
    });
  }, []);

  // Road Frontage Multi-Edge ("Çoklu Kırık") Toggle Handler
  const handleToggleFrontageEdge = useCallback(
    (edgeIndex: number) => {
      setSelectedFrontageEdgeIndices((prev) => {
        const next = prev.includes(edgeIndex)
          ? prev.filter((idx) => idx !== edgeIndex)
          : [...prev, edgeIndex];

        pushUndoState(`Yol Cephesi Güncellendi (${next.length} Kırık Kenar)`);

        const multi = calculateMultiEdgeFrontage(mainPolygonEdges, next);
        if (next.length > 0) {
          const updatedConfig = {
            ...config,
            rotateAngle: multi.perpAngle,
            selectedFrontageEdgeIndices: next
          };
          setConfig(updatedConfig);

          if (mainPolygon) {
            try {
              const generated = runSubdivisionProcess(mainPolygon, updatedConfig, roadLines);
              setParcels(generated);
              setSelectedParcelIds([]);
              isCadDirtyRef.current = false;
            } catch (e: any) {
              console.error('İfraz Hatası:', e);
            }
          }

          setStatusMessage(
            `${next.length} adet kırık kenar yol cephesi olarak seçildi (Toplam ${multi.totalLengthM}m, İfraz Açısı: ${multi.perpAngle}°).`
          );
        } else {
          setStatusMessage('Yol cephesi seçimi temizlendi.');
        }

        return next;
      });
    },
    [mainPolygonEdges, config, mainPolygon, roadLines, pushUndoState]
  );

  // Clear Road Frontage
  const handleClearFrontage = useCallback(() => {
    setSelectedFrontageEdgeIndices([]);
    setIsSelectingFrontageEdge(false);
    setEdgeSelectionMode('none');
    setStatusMessage('Yol cephesi seçimi sıfırlandı.');
  }, []);

  // Map Edge Selection Handler for Road, Left (West), and Right (East)
  const handleSelectEdgeForMode = useCallback(
    (mode: 'road' | 'left' | 'right', edgeIndex: number) => {
      if (mode === 'road') {
        handleToggleFrontageEdge(edgeIndex);
      } else if (mode === 'left') {
        pushUndoState(`Sol Kenar (Batı) Kenar #${edgeIndex + 1} Olarak Seçildi`);
        const updatedConfig = {
          ...config,
          leftSideEdgeIndex: edgeIndex,
          westEdgeIndex: edgeIndex,
          subdivisionMethod: 'trapezoidFrontage' as const
        };
        setConfig(updatedConfig);
        if (mainPolygon) {
          try {
            const generated = runSubdivisionProcess(mainPolygon, updatedConfig, roadLines);
            setParcels(generated);
            setSelectedParcelIds([]);
            isCadDirtyRef.current = false;
          } catch (e: any) {
            console.error('İfraz Hatası:', e);
          }
        }
        setStatusMessage(`Sol Kenar (Batı) Kenar #${edgeIndex + 1} olarak seçildi.`);
      } else if (mode === 'right') {
        pushUndoState(`Sağ Kenar (Doğu) Kenar #${edgeIndex + 1} Olarak Seçildi`);
        const updatedConfig = {
          ...config,
          rightSideEdgeIndex: edgeIndex,
          eastEdgeIndex: edgeIndex,
          subdivisionMethod: 'trapezoidFrontage' as const
        };
        setConfig(updatedConfig);
        if (mainPolygon) {
          try {
            const generated = runSubdivisionProcess(mainPolygon, updatedConfig, roadLines);
            setParcels(generated);
            setSelectedParcelIds([]);
            isCadDirtyRef.current = false;
          } catch (e: any) {
            console.error('İfraz Hatası:', e);
          }
        }
        setStatusMessage(`Sağ Kenar (Doğu) Kenar #${edgeIndex + 1} olarak seçildi.`);
      }
      setEdgeSelectionMode('none');
    },
    [config, mainPolygon, roadLines, handleToggleFrontageEdge, pushUndoState]
  );

  // Save Settings ("Ayarlarımı Sakla")
  const handleSaveSettings = useCallback(() => {
    try {
      localStorage.setItem(
        'ifraz_user_settings',
        JSON.stringify({
          mapSettings,
          configPreferences: {
            selectedProvince: config.selectedProvince,
            selectedDistrict: config.selectedDistrict,
            minFrontageVal: config.minFrontageVal,
            minAreaVal: config.minAreaVal
          },
          savedAt: new Date().toISOString()
        })
      );
      setIsSettingsSaved(true);
      setStatusMessage('Ayarlarınız (Gece/Gündüz, Saydamlık, Buton ve Yazı Boyutu) başarıyla saklandı.');
      setTimeout(() => setIsSettingsSaved(false), 3000);
    } catch (e: any) {
      console.error('Save settings error:', e);
    }
  }, [mapSettings, config]);

  // Reset Settings to Defaults
  const handleResetSettings = useCallback(() => {
    try {
      localStorage.removeItem('ifraz_user_settings');
      setMapSettings(DEFAULT_MAP_SETTINGS);
      setIsSettingsSaved(false);
      setStatusMessage('Ayarlar varsayılan değerlere sıfırlandı.');
    } catch (e: any) {
      console.error('Reset settings error:', e);
    }
  }, []);

  // Sürükle-Bırak Tevhit Modu Butonu Aç/Kapat
  const handleToggleDragMerge = useCallback(() => {
    setMapSettings((prev) => {
      const next = !prev.enableDragMerge;
      setStatusMessage(
        next
          ? 'Sürükle-Bırak Tevhit Aktif: Birleştirmek istediğiniz bir parseli diğerinin üzerine sürükleyip bırakın.'
          : 'Sürükle-Bırak Tevhit Modu Kapatıldı.'
      );
      return { ...prev, enableDragMerge: next };
    });
  }, []);

  // Multi-KML File Upload Handler
  const handleKMLUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    pushUndoState('Kadastro Dosyaları Yüklendi');

    const newLoadedFiles: LoadedCadastralFile[] = [];
    const allParsedRoads: Feature<LineString>[] = [];
    let firstParcelToActivate: LoadedCadastralParcel | null = null;

    for (let fIdx = 0; fIdx < fileList.length; fIdx++) {
      const file = fileList[fIdx];
      try {
        const text = await file.text();
        const parsed = parseKMLToGeoJSON(text, file.name);

        if (parsed.roadLines && parsed.roadLines.length > 0) {
          allParsedRoads.push(...parsed.roadLines);
        }

        const fileId = `file-${Date.now()}-${fIdx}`;
        const fileParcels: LoadedCadastralParcel[] = [];

        // For each placemark/parcel in this file
        for (let pIdx = 0; pIdx < parsed.allParcels.length; pIdx++) {
          const item = parsed.allParcels[pIdx];
          const derived = await deriveCadastralLocation(item.geometry, item.cadastralInfo);
          const topography = calculateParcelTopography(item.geometry);
          const soilClassification = estimateSoilClassification(item.geometry, topography, derived);
          const loadedParcel: LoadedCadastralParcel = {
            id: item.id || `parcel-${fileId}-${pIdx}`,
            fileId,
            fileName: file.name,
            name: item.name || `${derived.adaNo}/${derived.parselNo}`,
            geometry: item.geometry,
            cadastralInfo: derived,
            rawProperties: item.rawProperties || {},
            areaM2: item.areaM2,
            isActive: false,
            soilClassification,
            topography
          };
          fileParcels.push(loadedParcel);

          if (!firstParcelToActivate) {
            firstParcelToActivate = loadedParcel;
          }
        }

        newLoadedFiles.push({
          id: fileId,
          fileName: file.name,
          uploadTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          fileSize: file.size,
          parcels: fileParcels,
          roadLines: parsed.roadLines || []
        });
      } catch (err: any) {
        console.error(`Dosya Okuma Hatası (${file.name}):`, err);
      }
    }

    if (newLoadedFiles.length === 0) {
      alert('Yüklenen dosyalarda geçerli parsel geometrisi bulunamadı.');
      return;
    }

    setLoadedFiles((prev) => [...prev, ...newLoadedFiles]);

    if (allParsedRoads.length > 0) {
      setRoadLines((prev) => [...prev, ...allParsedRoads]);
    }

    if (firstParcelToActivate) {
      firstParcelToActivate.isActive = true;
      setMainPolygon(firstParcelToActivate.geometry);
      setCadastralInfo(firstParcelToActivate.cadastralInfo);
      setActiveParcelId(firstParcelToActivate.id);
      setSelectedFrontageEdgeIndices([]);
      setIsSelectingFrontageEdge(false);
    }

    const totalNewParcels = newLoadedFiles.reduce((acc, f) => acc + f.parcels.length, 0);
    if (newLoadedFiles.length === 1) {
      const f = newLoadedFiles[0];
      const p = f.parcels[0];
      setStatusMessage(
        `Kadastro Yüklendi (${f.fileName}): ${p.cadastralInfo.il} / ${p.cadastralInfo.ilce} • ${p.cadastralInfo.mahalle} (Ada: ${p.cadastralInfo.adaNo}, Parsel: ${p.cadastralInfo.parselNo}) • ${f.parcels.length} Parsel`
      );
    } else {
      setStatusMessage(
        `${newLoadedFiles.length} Kadastro Dosyası Yüklendi (${totalNewParcels} Parsel). Görünürlük > Öznitelikler menüsünden inceleyebilirsiniz.`
      );
    }
  };

  const handleSelectActiveParcel = useCallback((parcel: LoadedCadastralParcel) => {
    setMainPolygon(parcel.geometry);
    setCadastralInfo(parcel.cadastralInfo);
    setActiveParcelId(parcel.id);
    setSelectedFrontageEdgeIndices([]);
    setStatusMessage(
      `Aktif Çalışma Parseli: ${parcel.cadastralInfo.il} / ${parcel.cadastralInfo.ilce} • Ada: ${parcel.cadastralInfo.adaNo}, Parsel: ${parcel.cadastralInfo.parselNo} (${parcel.areaM2.toFixed(1)} m²)`
    );
  }, []);

  const handleRemoveFile = useCallback((fileId: string) => {
    setLoadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleRemoveParcel = useCallback((parcelId: string) => {
    setLoadedFiles((prev) =>
      prev
        .map((f) => ({
          ...f,
          parcels: f.parcels.filter((p) => p.id !== parcelId)
        }))
        .filter((f) => f.parcels.length > 0)
    );
  }, []);

  const handleDragMergeLoadedParcels = useCallback(
    (draggedId: string, targetId: string) => {
      let parcelA: { geometry: ParcelGeometry; cadastralInfo: CadastralInfo; id: string } | null = null;
      let parcelB: { geometry: ParcelGeometry; cadastralInfo: CadastralInfo; id: string } | null = null;

      if (draggedId === 'main') {
        if (mainPolygon) {
          parcelA = { geometry: mainPolygon, cadastralInfo, id: activeParcelId || 'main' };
        }
      } else {
        const found = allLoadedParcels.find((p) => p.id === draggedId);
        if (found) parcelA = { geometry: found.geometry, cadastralInfo: found.cadastralInfo as CadastralInfo, id: found.id };
      }

      if (targetId === 'main') {
        if (mainPolygon) {
          parcelB = { geometry: mainPolygon, cadastralInfo, id: activeParcelId || 'main' };
        }
      } else {
        const found = allLoadedParcels.find((p) => p.id === targetId);
        if (found) parcelB = { geometry: found.geometry, cadastralInfo: found.cadastralInfo as CadastralInfo, id: found.id };
      }

      if (!parcelA || !parcelB) return;

      pushUndoState(`Tevhit: ${parcelA.cadastralInfo.adaNo}/${parcelA.cadastralInfo.parselNo} ile ${parcelB.cadastralInfo.adaNo}/${parcelB.cadastralInfo.parselNo}`);

      try {
        const unionPoly = turf.union(turf.featureCollection([parcelA.geometry, parcelB.geometry]));
        if (!unionPoly) throw new Error('Geometriler birleştirilemedi.');

        const mergedAda =
          parcelA.cadastralInfo.adaNo === parcelB.cadastralInfo.adaNo
            ? parcelA.cadastralInfo.adaNo
            : `${parcelA.cadastralInfo.adaNo}/${parcelB.cadastralInfo.adaNo}`;

        const mergedParsel =
          parcelA.cadastralInfo.parselNo === parcelB.cadastralInfo.parselNo
            ? parcelA.cadastralInfo.parselNo
            : `${parcelA.cadastralInfo.parselNo}+${parcelB.cadastralInfo.parselNo}`;

        const newArea = turf.area(unionPoly);

        const mergedCadastral: CadastralInfo = {
          il: parcelA.cadastralInfo.il || parcelB.cadastralInfo.il,
          ilce: parcelA.cadastralInfo.ilce || parcelB.cadastralInfo.ilce,
          mahalle: parcelA.cadastralInfo.mahalle || parcelB.cadastralInfo.mahalle,
          adaNo: mergedAda,
          parselNo: mergedParsel,
          mevkii: parcelA.cadastralInfo.mevkii || parcelB.cadastralInfo.mevkii || 'Tevhit Parseli',
          nitelik: parcelA.cadastralInfo.nitelik || parcelB.cadastralInfo.nitelik || 'Arsa / Tarla',
          tapuAlaniM2: newArea,
          source: 'file'
        };

        const unionGeometry = unionPoly as ParcelGeometry;
        setMainPolygon(unionGeometry);
        setCadastralInfo(mergedCadastral);
        const newActiveId = `merged-${Date.now()}`;
        setActiveParcelId(newActiveId);

        setLoadedFiles((prev) => {
          const removedIds = new Set([parcelA!.id, parcelB!.id]);
          let updated = prev
            .map((f) => ({
              ...f,
              parcels: f.parcels.filter((p) => !removedIds.has(p.id))
            }))
            .filter((f) => f.parcels.length > 0);

          const mergedTopo = calculateParcelTopography(unionGeometry);
          const mergedSoil = estimateSoilClassification(unionGeometry, mergedTopo, mergedCadastral);

          const newLoadedParcel: LoadedCadastralParcel = {
            id: newActiveId,
            fileId: 'merged-files',
            fileName: 'Tevhit_Parseli.kml',
            name: `${mergedAda}/${mergedParsel}`,
            geometry: unionGeometry,
            cadastralInfo: mergedCadastral,
            rawProperties: {
              ADA: mergedAda,
              PARSEL: mergedParsel,
              IL: mergedCadastral.il,
              ILCE: mergedCadastral.ilce,
              MAHALLE: mergedCadastral.mahalle,
              ALAN: newArea.toFixed(2),
              TEVHIT: 'EVET'
            },
            areaM2: newArea,
            isActive: true,
            topography: mergedTopo,
            soilClassification: mergedSoil
          };

          if (updated.length > 0) {
            updated[0] = {
              ...updated[0],
              parcels: [newLoadedParcel, ...updated[0].parcels]
            };
          } else {
            updated = [
              {
                id: 'merged-file-group',
                fileName: 'Tevhit Edilen Parseller',
                uploadTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                parcels: [newLoadedParcel],
                roadLines: []
              }
            ];
          }

          return updated;
        });

        // Reset subdivided pieces so user can sub-divide the new merged parcel
        setParcels([]);
        setSelectedParcelIds([]);

        setStatusMessage(
          `Sürükle-Bırak Tevhit Tamamlandı: Ada ${mergedAda}, Parsel ${mergedParsel} (${newArea.toFixed(1)} m²)`
        );
      } catch (err: any) {
        console.error('Tevhit hatası:', err);
        alert(`Tevhit Hatası: ${err.message || 'Geometriler birleştirilemedi'}`);
      }
    },
    [mainPolygon, cadastralInfo, activeParcelId, allLoadedParcels, pushUndoState]
  );

  const handleMergeLoadedParcels = useCallback(
    (parcelsToMerge: LoadedCadastralParcel[]) => {
      if (parcelsToMerge.length < 2) return;
      pushUndoState('Seçilen Kadastro Parselleri Tevhit Edildi');

      try {
        let unionPoly: any = parcelsToMerge[0].geometry;
        for (let i = 1; i < parcelsToMerge.length; i++) {
          unionPoly = turf.union(turf.featureCollection([unionPoly, parcelsToMerge[i].geometry]));
        }

        if (unionPoly) {
          const unionGeometry = unionPoly as ParcelGeometry;
          const mergedAda = Array.from(new Set(parcelsToMerge.map((p) => p.cadastralInfo.adaNo))).join('/');
          const mergedParsel = parcelsToMerge.map((p) => p.cadastralInfo.parselNo).join('+');
          const newArea = turf.area(unionPoly);

          const mergedCadastral: CadastralInfo = {
            ...parcelsToMerge[0].cadastralInfo,
            adaNo: mergedAda,
            parselNo: mergedParsel,
            tapuAlaniM2: newArea,
            mevkii: 'Tevhit Parseli'
          };

          setMainPolygon(unionGeometry);
          setCadastralInfo(mergedCadastral);
          const newActiveId = `merged-multi-${Date.now()}`;
          setActiveParcelId(newActiveId);

          setLoadedFiles((prev) => {
            const removedIds = new Set(parcelsToMerge.map((p) => p.id));
            let updated = prev
              .map((f) => ({
                ...f,
                parcels: f.parcels.filter((p) => !removedIds.has(p.id))
              }))
              .filter((f) => f.parcels.length > 0);

            const newLoadedParcel: LoadedCadastralParcel = {
              id: newActiveId,
              fileId: 'merged-files',
              fileName: 'Tevhit_Parseli.kml',
              name: `${mergedAda}/${mergedParsel}`,
              geometry: unionGeometry,
              cadastralInfo: mergedCadastral,
              rawProperties: {
                ADA: mergedAda,
                PARSEL: mergedParsel,
                ALAN: newArea.toFixed(2),
                TEVHIT: 'EVET'
              },
              areaM2: newArea,
              isActive: true
            };

            if (updated.length > 0) {
              updated[0] = {
                ...updated[0],
                parcels: [newLoadedParcel, ...updated[0].parcels]
              };
            } else {
              updated = [
                {
                  id: 'merged-file-group',
                  fileName: 'Tevhit Edilen Parseller',
                  uploadTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                  parcels: [newLoadedParcel],
                  roadLines: []
                }
              ];
            }

            return updated;
          });

          setParcels([]);
          setSelectedParcelIds([]);

          setStatusMessage(
            `${parcelsToMerge.length} Parsel Tevhit Edildi (Birleştirildi): Ada ${mergedCadastral.adaNo}, Parsel ${mergedCadastral.parselNo} (${newArea.toFixed(1)} m²)`
          );
        }
      } catch (e: any) {
        alert(`Tevhit Hatası: ${e.message}`);
      }
    },
    [pushUndoState]
  );

  // Reset Configuration
  const handleReset = () => {
    pushUndoState('Parametreler Sıfırlandı');
    setConfig(DEFAULT_CONFIG);
  };

  // Export Downloads
  const handleExportKML = () => {
    const content = exportToKML(parcels);
    triggerFileDownload(content, 'Tevhid_Ifraz_Parselleri.kml', 'application/vnd.google-earth.kml+xml');
  };

  const handleExportGeoJSON = () => {
    const content = exportToGeoJSON(parcels);
    triggerFileDownload(content, 'Tevhid_Ifraz_Parselleri.geojson', 'application/json');
  };

  const handleExportCSV = () => {
    const content = exportToCSV(parcels);
    triggerFileDownload(content, 'Tevhid_Ifraz_Koordinat_Listesi.csv', 'text/csv;charset=utf-8;');
  };

  // Soil & Slope Analysis Modal Handler
  const handleOpenSoilAnalysis = useCallback((parcel?: LoadedCadastralParcel | GeneratedParcel, tab: 'soil' | 'slope' = 'soil') => {
    if (parcel) {
      setSoilModalParcelId(parcel.id);
    } else if (activeParcelId) {
      setSoilModalParcelId(activeParcelId);
    } else if (parcels[0]) {
      setSoilModalParcelId(parcels[0].id);
    }
    setSoilModalInitialTab(tab);
    setIsSoilModalOpen(true);
  }, [activeParcelId, parcels]);

  const handleUpdateSoilClass = useCallback(
    (parcelId: string, newClass: 'ZA' | 'ZB' | 'ZC' | 'ZD' | 'ZE' | 'ZF') => {
      const details = getSoilClassDetails(newClass);

      // Update generated parcels if matches
      setParcels((prev) =>
        prev.map((p) => (p.id === parcelId ? { ...p, soilClassification: details } : p))
      );

      // Update loaded files parcels if matches
      setLoadedFiles((prev) =>
        prev.map((f) => ({
          ...f,
          parcels: f.parcels.map((p) => (p.id === parcelId ? { ...p, soilClassification: details } : p))
        }))
      );

      setStatusMessage(`Zemin Sınıfı güncellendi: ${newClass} (qa = ${details.bearingCapacityKgCm2} kg/cm²).`);
    },
    []
  );

  // Handle saving of newly hand-drawn parcel with user-specified name and mode
  const handleSaveDrawnParcel = useCallback(
    async (params: {
      parcelName: string;
      adaNo: string;
      parselNo: string;
      nitelik: string;
      targetMode: 'active' | 'secondary';
    }) => {
      if (!pendingDrawnPolygon) return;
      pushUndoState(`Haritada Yeni Parsel Eklendi: ${params.parcelName}`);

      const areaM2 = turf.area(pendingDrawnPolygon);
      const derivedLocation = await deriveCadastralLocation(pendingDrawnPolygon);
      const topography = calculateParcelTopography(pendingDrawnPolygon);
      const finalCadastral: CadastralInfo = {
        il: derivedLocation.il || cadastralInfo.il || 'Ankara',
        ilce: derivedLocation.ilce || cadastralInfo.ilce || 'Gölbaşı',
        mahalle: derivedLocation.mahalle || cadastralInfo.mahalle || 'İncek',
        adaNo: params.adaNo || derivedLocation.adaNo || '101',
        parselNo: params.parselNo || derivedLocation.parselNo || '1',
        mevkii: cadastralInfo.mevkii || 'Köy İçi',
        nitelik: params.nitelik || 'Arsa / Parsel',
        tapuAlaniM2: areaM2,
        source: 'manual'
      };
      const soilClassification = estimateSoilClassification(pendingDrawnPolygon, topography, finalCadastral);

      const newParcelId = `drawn-parcel-${Date.now()}`;
      const newLoadedParcel: LoadedCadastralParcel = {
        id: newParcelId,
        fileId: 'manual-drawings',
        fileName: 'Çizilen_Parseller',
        name: params.parcelName || `${finalCadastral.adaNo}/${finalCadastral.parselNo}`,
        geometry: pendingDrawnPolygon,
        cadastralInfo: finalCadastral,
        rawProperties: {
          AD: params.parcelName,
          ADA: finalCadastral.adaNo,
          PARSEL: finalCadastral.parselNo,
          NITELIK: finalCadastral.nitelik || '',
          ALAN: areaM2.toFixed(2),
          KAYNAK: 'Elle Çizim'
        },
        areaM2,
        isActive: params.targetMode === 'active',
        topography,
        soilClassification
      };

      // Add to loadedFiles under manual-drawings group
      setLoadedFiles((prev) => {
        const existingGroupIndex = prev.findIndex((f) => f.id === 'manual-drawings');
        if (existingGroupIndex >= 0) {
          const updated = [...prev];
          updated[existingGroupIndex] = {
            ...updated[existingGroupIndex],
            parcels: [newLoadedParcel, ...updated[existingGroupIndex].parcels]
          };
          return updated;
        } else {
          return [
            ...prev,
            {
              id: 'manual-drawings',
              fileName: 'Çizilen İlave Parseller',
              uploadTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              parcels: [newLoadedParcel],
              roadLines: []
            }
          ];
        }
      });

      if (params.targetMode === 'active') {
        // Set directly as active parcel for subdivision
        setMainPolygon(pendingDrawnPolygon);
        setCadastralInfo(finalCadastral);
        setActiveParcelId(newParcelId);
        setSelectedFrontageEdgeIndices([]);
        setStatusMessage(
          `Aktif İfraz Parseli Belirlendi: ${params.parcelName} (${finalCadastral.adaNo}/${finalCadastral.parselNo}) - ${areaM2.toFixed(1)} m²`
        );
      } else {
        // Kept as secondary/additional parcel (can be merged or selected anytime)
        setStatusMessage(
          `İlave Parsel Eklendi: ${params.parcelName} (${finalCadastral.adaNo}/${finalCadastral.parselNo}) - ${areaM2.toFixed(1)} m². Sürükle-bırak ile tevhit edilebilir veya listeden aktif yapılabilir.`
        );
      }

      setPendingDrawnPolygon(null);
      setActiveDrawTool(null);
    },
    [pendingDrawnPolygon, cadastralInfo, pushUndoState]
  );

  const handlePolygonCreated = useCallback(
    (poly: ParcelGeometry) => {
      setPendingDrawnPolygon(poly);
      setIsDrawnParcelModalOpen(true);
      setActiveDrawTool(null);
    },
    []
  );

  // Calculate Real-time Summary Statistics
  const stats: StatsSummary = useMemo(() => {
    if (parcels.length === 0) {
      return {
        totalAreaM2: 0,
        parcelCount: 0,
        validCount: 0,
        invalidCount: 0,
        minAreaM2: 0,
        maxAreaM2: 0,
        avgAreaM2: 0,
        stdDevM2: 0,
        complianceRate: 100
      };
    }

    const areas = parcels.map((p) => p.areaM2);
    const totalAreaM2 = areas.reduce((acc, a) => acc + a, 0);
    const avgAreaM2 = totalAreaM2 / parcels.length;
    const minAreaM2 = Math.min(...areas);
    const maxAreaM2 = Math.max(...areas);

    const variance = areas.reduce((acc, a) => acc + Math.pow(a - avgAreaM2, 2), 0) / parcels.length;
    const stdDevM2 = Math.sqrt(variance);

    const validCount = parcels.filter((p) => p.isValid).length;
    const invalidCount = parcels.length - validCount;
    const complianceRate = (validCount / parcels.length) * 100;

    return {
      totalAreaM2,
      parcelCount: parcels.length,
      validCount,
      invalidCount,
      minAreaM2,
      maxAreaM2,
      avgAreaM2,
      stdDevM2,
      complianceRate
    };
  }, [parcels]);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden font-sans select-none transition-colors duration-200 ${
        mapSettings.theme === 'light'
          ? 'theme-light bg-slate-100 text-slate-900'
          : 'theme-dark bg-slate-950 text-slate-100'
      }`}
      style={{
        ['--panel-opacity' as any]: (mapSettings.uiOpacity ?? 78) / 100,
        ['--ui-scale' as any]: `${(mapSettings.uiScale ?? 100) / 100}`,
        fontSize: `${(mapSettings.uiScale ?? 100) / 100}rem`
      }}
    >
      {/* Map Element */}
      <MapContainer
        mainPolygon={mainPolygon}
        parcels={parcels}
        roadLines={roadLines}
        mapSettings={mapSettings}
        onChangeMapSettings={setMapSettings}
        axisConfig={{
          isDoubleRow: config.isDoubleRow,
          axisPosition: config.axisPosition,
          angle: config.isSplitAngles ? config.leftAngle : config.commonAngle
        }}
        selectedParcelIds={selectedParcelIds}
        onParcelSelectToggle={handleParcelSelectToggle}
        onDragMerge={handleDragMerge}
        onPolygonCreated={handlePolygonCreated}
        onRoadLineCreated={(line) => setRoadLines((prev) => [...prev, line])}
        onParcelGeometryUpdated={handleParcelGeometryUpdated}
        onParcelSliced={handleParcelSliced}
        onToggleCadMode={(active) => setMapSettings((prev) => ({ ...prev, cadModeActive: active }))}
        onChangeCadTool={(tool) => setMapSettings((prev) => ({ ...prev, cadActiveTool: tool }))}
        isSelectingFrontageEdge={isSelectingFrontageEdge}
        edgeSelectionMode={edgeSelectionMode}
        selectedFrontageEdgeIndices={selectedFrontageEdgeIndices}
        westEdgeIndex={config.westEdgeIndex}
        eastEdgeIndex={config.eastEdgeIndex}
        leftSideEdgeIndex={config.leftSideEdgeIndex}
        rightSideEdgeIndex={config.rightSideEdgeIndex}
        onToggleFrontageEdge={handleToggleFrontageEdge}
        onSelectEdgeForMode={handleSelectEdgeForMode}
        onDoneSelectingFrontage={() => {
          setIsSelectingFrontageEdge(false);
          setEdgeSelectionMode('none');
        }}
        onToggleDragMerge={handleToggleDragMerge}
        onOpenAttributeDrawer={() => setIsAttributeDrawerOpen(true)}
        loadedParcelsCount={allLoadedParcels.length}
        isAttributeDrawerOpen={isAttributeDrawerOpen}
        secondaryParcels={secondaryParcels}
        onSelectActiveParcel={handleSelectActiveParcel}
        onDragMergeLoadedParcels={handleDragMergeLoadedParcels}
        externalDrawTool={activeDrawTool}
        onActiveDrawToolChange={setActiveDrawTool}
      />

      {/* Floating Control Panel */}
      <ControlPanel
        config={config}
        onChangeConfig={setConfig}
        mapSettings={mapSettings}
        onChangeMapSettings={setMapSettings}
        stats={stats}
        parcels={parcels}
        selectedParcelIds={selectedParcelIds}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onKMLUpload={handleKMLUpload}
        onMergeSelected={handleMergeSelected}
        onExportKML={handleExportKML}
        onExportGeoJSON={handleExportGeoJSON}
        onExportCSV={handleExportCSV}
        onReset={handleReset}
        onUpdateParcelAttributes={handleUpdateParcelAttributes}
        statusMessage={statusMessage}
        onOpenPrintModal={() => setIsPrintModalOpen(true)}
        onOpenSoilAnalysis={(tab) => handleOpenSoilAnalysis(undefined, tab || 'soil')}
        onRecalculate={handleRecalculate}
        roadLines={roadLines}
        mainPolygonEdges={mainPolygonEdges}
        selectedFrontageEdgeIndices={selectedFrontageEdgeIndices}
        isSelectingFrontageEdge={isSelectingFrontageEdge}
        edgeSelectionMode={edgeSelectionMode}
        onSetEdgeSelectionMode={setEdgeSelectionMode}
        onToggleSelectFrontageEdge={handleToggleSelectFrontageEdge}
        onToggleFrontageEdge={handleToggleFrontageEdge}
        onClearFrontage={handleClearFrontage}
        onSaveSettings={handleSaveSettings}
        onResetSettings={handleResetSettings}
        isSettingsSaved={isSettingsSaved}
        isDrawingPolygon={activeDrawTool === 'polygon'}
        onToggleDrawPolygon={() => {
          setActiveDrawTool((prev) => (prev === 'polygon' ? null : 'polygon'));
          setStatusMessage(
            activeDrawTool === 'polygon'
              ? 'Parsel çizimi kapatıldı.'
              : 'Elle Parsel Alanı Çizimi Aktif: Harita üzerinde köşe noktalarını tıklayarak parselinizi oluşturun. Bitirmek için çift tıklayın veya ilk noktaya tıklayın.'
          );
        }}
      />

      {/* Official Cadastral Print / PDF Report Modal */}
      <PrintReportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        mainPolygon={mainPolygon}
        parcels={parcels}
        roadLines={roadLines}
        config={config}
        cadastralInfo={cadastralInfo}
        onUpdateCadastralInfo={setCadastralInfo}
      />

      {/* Cadastral Attributes Table Drawer */}
      <CadastralAttributeDrawer
        isOpen={isAttributeDrawerOpen}
        onClose={() => setIsAttributeDrawerOpen(false)}
        loadedFiles={loadedFiles}
        activeParcelId={activeParcelId ?? undefined}
        onSelectActiveParcel={handleSelectActiveParcel}
        onZoomToParcel={(p) => {
          setIsAttributeDrawerOpen(false);
          handleSelectActiveParcel(p);
        }}
        onRemoveFile={handleRemoveFile}
        onRemoveParcel={handleRemoveParcel}
        onMergeParcels={handleMergeLoadedParcels}
        onUploadAdditionalKML={handleKMLUpload}
        onOpenSoilAnalysis={(parcel, tab) => handleOpenSoilAnalysis(parcel, tab || 'soil')}
      />

      {/* TBDY 2018 Soil Type & Geotechnical Analysis / Slope Report Modal */}
      <SoilAnalysisModal
        isOpen={isSoilModalOpen}
        onClose={() => setIsSoilModalOpen(false)}
        initialTab={soilModalInitialTab}
        activeParcel={
          allLoadedParcels.find((p) => p.id === soilModalParcelId) ||
          parcels.find((p) => p.id === soilModalParcelId) ||
          allLoadedParcels[0] ||
          parcels[0] ||
          null
        }
        allParcels={[...allLoadedParcels, ...parcels]}
        onSelectParcel={(id) => setSoilModalParcelId(id)}
        onUpdateSoilClass={handleUpdateSoilClass}
      />

      {/* Hand-Drawn Parcel Naming & Attribute Modal */}
      <NewDrawnParcelModal
        isOpen={isDrawnParcelModalOpen}
        onClose={() => {
          setIsDrawnParcelModalOpen(false);
          setPendingDrawnPolygon(null);
        }}
        geometry={pendingDrawnPolygon}
        defaultLocation={{
          il: cadastralInfo.il,
          ilce: cadastralInfo.ilce,
          mahalle: cadastralInfo.mahalle,
          adaNo: cadastralInfo.adaNo,
          parselNo: cadastralInfo.parselNo
        }}
        onSaveParcel={handleSaveDrawnParcel}
      />

      {/* Dynamic Status / Bilgi Barı (Alt Ekran Apple-Glass Dinamik Ada) */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[990] max-w-[94vw] md:max-w-2xl px-4 py-2 apple-glass rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/15 text-slate-200 text-xs flex items-center gap-2.5 pointer-events-auto backdrop-blur-2xl transition-all duration-300 select-none">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse shrink-0" />
        
        {/* Kadastro Konum Çipi (İl, İlçe, Mahalle, Ada, Parsel) */}
        <div className="flex items-center gap-1.5 truncate text-[11px] shrink-0">
          <span className="font-semibold text-white">{cadastralInfo.il} / {cadastralInfo.ilce}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300 truncate max-w-[130px]" title={cadastralInfo.mahalle}>{cadastralInfo.mahalle}</span>
          <span className="text-slate-500">•</span>
          <span className="text-amber-400 font-mono font-bold">Ada: {cadastralInfo.adaNo}</span>
          <span className="text-amber-400 font-mono font-bold">Parsel: {cadastralInfo.parselNo}</span>
        </div>

        <div className="h-3 w-px bg-white/20 shrink-0" />

        {/* Mesaj & Durum */}
        <span className="truncate font-medium text-slate-300 text-[11px]">
          {statusMessage || 'Sistem Hazır'}
        </span>
        {parcels.length > 0 && (
          <>
            <div className="h-3 w-px bg-white/20 shrink-0" />
            <span className="text-[11px] font-mono text-emerald-400 font-semibold shrink-0">
              {parcels.length} Parsel
            </span>
          </>
        )}
      </div>

      {/* PWA Offline Mode Indicator */}
      <OfflineIndicator />
    </div>
  );
}
