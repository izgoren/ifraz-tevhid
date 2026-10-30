import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Feature, LineString } from 'geojson';
import * as turf from '@turf/turf';
import { MapContainer } from './components/MapContainer';
import { ControlPanel } from './components/ControlPanel';
import { PrintReportModal } from './components/PrintReportModal';
import {
  GeneratedParcel,
  MapSettings,
  ParcelGeometry,
  StatsSummary,
  SubdivisionConfig,
  UndoRedoState
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
  minFrontageVal: 12,
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
  selectedFrontageEdgeIndices: []
};

const DEFAULT_MAP_SETTINGS: MapSettings = {
  tileProvider: 'googleHybrid',
  showFill: true,
  showNames: true,
  showAreas: true,
  showEdgeLengths: true,
  enableDragMerge: true,
  selectModeMerge: true,
  cadModeActive: false,
  cadActiveTool: 'vertex',
  theme: 'dark',
  uiOpacity: 78,
  parcelFillOpacity: 45
};

const getStoredMapSettings = (): MapSettings => {
  try {
    const raw = localStorage.getItem('ifraz_user_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.mapSettings) {
        return { ...DEFAULT_MAP_SETTINGS, ...parsed.mapSettings };
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

  // Multi-edge Road Frontage Selection States ("Çoklu Kırık")
  const [isSelectingFrontageEdge, setIsSelectingFrontageEdge] = useState<boolean>(false);
  const [selectedFrontageEdgeIndices, setSelectedFrontageEdgeIndices] = useState<number[]>([]);

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

    // If user made manual CAD edits, don't auto-recalculate unless main polygon or piece count changes
    try {
      const generated = runSubdivisionProcess(mainPolygon, config, roadLines);
      setParcels(generated);
      setSelectedParcelIds([]);
      isCadDirtyRef.current = false;

      const invalidCount = generated.filter((p) => !p.isValid).length;
      if (invalidCount > 0) {
        setStatusMessage(
          `${generated.length} Parsel Oluşturuldu (${invalidCount} adedi seçili ${config.selectedProvince}/${config.selectedDistrict} mevzuatını ihlal ediyor).`
        );
      } else {
        setStatusMessage(
          `${generated.length} Adet İfraz Parseli Hesaplandı (${config.selectedProvince} İmar Standartlarına Tam Uyumlu).`
        );
      }
    } catch (e: any) {
      console.error('İfraz Hatası:', e);
      setStatusMessage(`Hesaplama Hatası: ${e.message}`);
    }
  }, [mainPolygon, config, roadLines]);

  // Recalculate / Update Subdivision explicitly
  const handleRecalculate = useCallback(() => {
    if (!mainPolygon) {
      setStatusMessage('Önce haritada bir parsel çizin veya KML dosyası yükleyin.');
      return;
    }
    pushUndoState('İfraz Güncellendi');
    try {
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
              const { isValid, frontageM, depthM, reasons } = validateParcel(updated.feature, updated.areaM2, config, roadLines);
              updated.isValid = isValid;
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
      const { isValid, frontageM, depthM, reasons } = validateParcel(
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
    setStatusMessage('Yol cephesi seçimi sıfırlandı.');
  }, []);

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
      setStatusMessage('Ayarlarınız (Gece/Gündüz, Saydamlık ve Tercihler) başarıyla saklandı.');
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

  // KML File Upload Handler
  const handleKMLUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const { parcel, roadLines: parsedRoads } = parseKMLToGeoJSON(text);

        pushUndoState('KML Dosyası Yüklendi');
        setMainPolygon(parcel);
        setSelectedFrontageEdgeIndices([]);
        setIsSelectingFrontageEdge(false);
        if (parsedRoads && parsedRoads.length > 0) {
          setRoadLines(parsedRoads);
          setStatusMessage(`Harita Dosyası Yüklendi (${file.name}) — ${parsedRoads.length} adet Yol Cephesi Çizgisi Tespit Edildi.`);
        } else {
          setStatusMessage(`Harita Dosyası Yüklendi (${file.name}).`);
        }
      } catch (err: any) {
        alert(`Dosya Ayrıştırma Hatası: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

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
        ['--panel-opacity' as any]: (mapSettings.uiOpacity ?? 78) / 100
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
        onPolygonCreated={(poly) => {
          pushUndoState('Haritada Yeni Parsel Çizildi');
          setMainPolygon(poly);
          setSelectedFrontageEdgeIndices([]);
        }}
        onRoadLineCreated={(line) => setRoadLines((prev) => [...prev, line])}
        onParcelGeometryUpdated={handleParcelGeometryUpdated}
        onParcelSliced={handleParcelSliced}
        onToggleCadMode={(active) => setMapSettings((prev) => ({ ...prev, cadModeActive: active }))}
        onChangeCadTool={(tool) => setMapSettings((prev) => ({ ...prev, cadActiveTool: tool }))}
        isSelectingFrontageEdge={isSelectingFrontageEdge}
        selectedFrontageEdgeIndices={selectedFrontageEdgeIndices}
        onToggleFrontageEdge={handleToggleFrontageEdge}
        onDoneSelectingFrontage={() => setIsSelectingFrontageEdge(false)}
        onToggleDragMerge={handleToggleDragMerge}
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
        onRecalculate={handleRecalculate}
        roadLines={roadLines}
        mainPolygonEdges={mainPolygonEdges}
        selectedFrontageEdgeIndices={selectedFrontageEdgeIndices}
        isSelectingFrontageEdge={isSelectingFrontageEdge}
        onToggleSelectFrontageEdge={handleToggleSelectFrontageEdge}
        onToggleFrontageEdge={handleToggleFrontageEdge}
        onClearFrontage={handleClearFrontage}
        onSaveSettings={handleSaveSettings}
        onResetSettings={handleResetSettings}
        isSettingsSaved={isSettingsSaved}
      />

      {/* Official Zoning & Cadastral Print / PDF Report Modal */}
      <PrintReportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        mainPolygon={mainPolygon}
        parcels={parcels}
        roadLines={roadLines}
        config={config}
      />
    </div>
  );
}
