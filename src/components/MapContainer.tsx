import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import * as turf from '@turf/turf';
import type { Feature, LineString, Polygon, MultiPolygon } from 'geojson';
import { GeneratedParcel, MapSettings, ParcelGeometry, LoadedCadastralParcel } from '../types';
import type { CadastralInfo } from '../utils/cadastralLocation';
import { getParcelVertices, ParcelVertex, getMainPolygonEdges, ParcelEdge } from '../utils/geometryOptimizer';
import {
  Scissors,
  Move,
  Check,
  Crosshair,
  Table,
  X,
  Compass,
  Navigation,
  Layers,
  PenTool,
  Trash2,
  Spline,
  Shapes,
  Droplets,
  Eye,
  ChevronRight,
  Hash,
  Ruler,
  Maximize2,
  TableProperties,
  Landmark,
  Mountain,
  HardHat,
  RotateCw,
  Copy,
  Magnet,
  Link2,
  GripHorizontal,
  Info,
  TrendingUp,
  MapPin
} from 'lucide-react';
import {
  CoordinateSystemId,
  formatCoordinateInSystem,
  getAutoTurefDom,
  getCoordinateSystemDisplayName,
  getTurefTm3Epsg,
  getUtmZoneInfo,
  TURKEY_TM3_DOMS
} from '../utils/coordinateSystems';
import {
  DynamicLineMode,
  DynamicGuideLine,
  extractEditableVertices,
  buildUpdatedParcelGeometry,
  hasSelfIntersection,
  extractBoundarySegments,
  buildDynamicGuideLines,
  snapVertexToDynamicLines,
  getMeterToleranceForPixels
} from '../utils/dynamicSnap';

interface MapContainerProps {
  mainPolygon: ParcelGeometry | null;
  parcels: GeneratedParcel[];
  roadLines?: Feature<LineString>[];
  mapSettings: MapSettings;
  axisConfig?: { isDoubleRow: boolean; axisPosition: number; angle: number };
  selectedParcelIds: string[];
  onParcelSelectToggle: (parcelId: string) => void;
  onDragMerge: (draggedIdx: number, targetIdx: number) => void;
  onPolygonCreated: (poly: ParcelGeometry) => void;
  onRoadLineCreated?: (line: Feature<LineString>) => void;
  onParcelGeometryUpdated?: (parcelId: string, updatedFeature: ParcelGeometry) => void;
  onBatchParcelGeometryUpdated?: (updates: Array<{ parcelId: string; updatedFeature: ParcelGeometry }>) => void;
  onMainPolygonUpdated?: (updatedFeature: ParcelGeometry) => void;
  onParcelSliced?: (parcelId: string, sliceLine: Feature<LineString>) => void;
  onToggleCadMode?: (active: boolean) => void;
  onChangeCadTool?: (tool: 'select' | 'vertex' | 'slice') => void;
  cutAngle?: number;
  isAdjustingCutAngle?: boolean;
  onToggleAdjustCutAngle?: () => void;
  onChangeCutAngle?: (deg: number) => void;
  isSelectingFrontageEdge?: boolean;
  edgeSelectionMode?: 'none' | 'road' | 'left' | 'right';
  selectedFrontageEdgeIndices?: number[];
  westEdgeIndex?: number;
  eastEdgeIndex?: number;
  leftSideEdgeIndex?: number;
  rightSideEdgeIndex?: number;
  onToggleFrontageEdge?: (edgeIndex: number) => void;
  onSelectEdgeForMode?: (mode: 'road' | 'left' | 'right', edgeIndex: number) => void;
  onDoneSelectingFrontage?: () => void;
  onToggleDragMerge?: () => void;
  onChangeMapSettings?: (newSettings: MapSettings) => void;
  onOpenAttributeDrawer?: () => void;
  loadedParcelsCount?: number;
  isAttributeDrawerOpen?: boolean;
  secondaryParcels?: LoadedCadastralParcel[];
  onSelectActiveParcel?: (parcel: LoadedCadastralParcel) => void;
  onDragMergeLoadedParcels?: (draggedId: string, targetId: string) => void;
  externalDrawTool?: 'polygon' | 'line' | 'delete' | null;
  onActiveDrawToolChange?: (tool: 'polygon' | 'line' | 'delete' | null) => void;
  isPickingTkgmParcel?: boolean;
  onPickTkgmCoord?: (lat: number, lng: number) => void;
  isObjectQueryActive?: boolean;
  onToggleObjectQuery?: () => void;
  cadastralInfo?: CadastralInfo;
  onOpenSoilAnalysis?: (tab?: 'soil' | 'slope', parcelId?: string) => void;
  onDeleteGeneratedParcel?: (parcelId: string) => void;
  onDeleteSecondaryParcel?: (parcelId: string) => void;
  onDeleteRoadLine?: (roadIndex: number) => void;
  onClearMainPolygon?: () => void;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  mainPolygon,
  parcels,
  roadLines = [],
  mapSettings,
  axisConfig,
  selectedParcelIds,
  onParcelSelectToggle,
  onDragMerge,
  onPolygonCreated,
  onRoadLineCreated,
  onParcelGeometryUpdated,
  onBatchParcelGeometryUpdated,
  onMainPolygonUpdated,
  onParcelSliced,
  onToggleCadMode,
  onChangeCadTool,
  cutAngle = 0,
  isAdjustingCutAngle = false,
  onToggleAdjustCutAngle,
  onChangeCutAngle,
  isSelectingFrontageEdge = false,
  edgeSelectionMode = 'none',
  selectedFrontageEdgeIndices = [],
  westEdgeIndex,
  eastEdgeIndex,
  leftSideEdgeIndex,
  rightSideEdgeIndex,
  onToggleFrontageEdge,
  onSelectEdgeForMode,
  onDoneSelectingFrontage,
  onToggleDragMerge,
  onChangeMapSettings,
  onOpenAttributeDrawer,
  loadedParcelsCount,
  isAttributeDrawerOpen,
  secondaryParcels = [],
  onSelectActiveParcel,
  onDragMergeLoadedParcels,
  externalDrawTool,
  onActiveDrawToolChange,
  isPickingTkgmParcel = false,
  onPickTkgmCoord,
  isObjectQueryActive = false,
  onToggleObjectQuery,
  cadastralInfo,
  onOpenSoilAnalysis,
  onDeleteGeneratedParcel,
  onDeleteSecondaryParcel,
  onDeleteRoadLine,
  onClearMainPolygon
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mainLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const secondaryParcelsGroupRef = useRef<L.LayerGroup | null>(null);
  const piecesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const edgeLabelsGroupRef = useRef<L.LayerGroup | null>(null);
  const axisLineLayerRef = useRef<L.LayerGroup | null>(null);
  const cutAngleLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const roadLinesGroupRef = useRef<L.LayerGroup | null>(null);
  const frontageEdgeGroupRef = useRef<L.LayerGroup | null>(null);
  const vertexMarkersGroupRef = useRef<L.LayerGroup | null>(null);
  const morphAnimationGroupRef = useRef<L.LayerGroup | null>(null);
  const drawMeasurementsGroupRef = useRef<L.LayerGroup | null>(null);
  const cadGuideLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const cadVertexLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | L.LayerGroup | null>(null);
  const skipFitBoundsRef = useRef<boolean>(false);
  const isPickingTkgmRef = useRef<boolean>(isPickingTkgmParcel);
  isPickingTkgmRef.current = isPickingTkgmParcel;
  const isObjectQueryRef = useRef<boolean>(isObjectQueryActive);
  isObjectQueryRef.current = isObjectQueryActive;
  const cadastralInfoRef = useRef<CadastralInfo | undefined>(cadastralInfo);
  cadastralInfoRef.current = cadastralInfo;
  const onDeleteGeneratedParcelRef = useRef(onDeleteGeneratedParcel);
  onDeleteGeneratedParcelRef.current = onDeleteGeneratedParcel;
  const onDeleteSecondaryParcelRef = useRef(onDeleteSecondaryParcel);
  onDeleteSecondaryParcelRef.current = onDeleteSecondaryParcel;
  const onDeleteRoadLineRef = useRef(onDeleteRoadLine);
  onDeleteRoadLineRef.current = onDeleteRoadLine;
  const onClearMainPolygonRef = useRef(onClearMainPolygon);
  onClearMainPolygonRef.current = onClearMainPolygon;

  const [showVertexTable, setShowVertexTable] = useState(false);
  const [coordSystem, setCoordSystem] = useState<CoordinateSystemId>('TUREF_TM3');
  const [selectedDom, setSelectedDom] = useState<number | 'auto'>('auto');
  const [selectedVertexParcelId, setSelectedVertexParcelId] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [activeDrawTool, setActiveDrawToolState] = useState<'polygon' | 'line' | 'delete' | null>(null);
  const activeDrawToolRef = useRef<'polygon' | 'line' | 'delete' | null>(null);
  activeDrawToolRef.current = activeDrawTool;

  const [inspectedObject, setInspectedObject] = useState<{
    kind: 'generated-parcel' | 'main-parcel' | 'secondary-parcel' | 'road-line' | 'map-point';
    id?: string;
    roadIndex?: number;
    title: string;
    subtitle?: string;
    areaM2?: number;
    perimeterM?: number;
    lengthM?: number;
    vertexCount?: number;
    edgeLengthsM?: number[];
    il?: string;
    ilce?: string;
    mahalle?: string;
    adaNo?: string;
    parselNo?: string;
    soilClass?: string;
    vs30?: number;
    bearingCapacity?: number;
    avgSlopePercent?: number;
    aspect?: string;
    elevationDiffM?: number;
    latlng: [number, number];
  } | null>(null);

  const [isRightMenuOpen, setIsRightMenuOpen] = useState(true);
  const cadPanelRef = useRef<HTMLDivElement | null>(null);
  const [cadPos, setCadPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 800, y: 16 };
    try {
      const saved = localStorage.getItem('ifraz_cad_panel_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return {
            x: Math.max(8, Math.min(window.innerWidth - 240, parsed.x)),
            y: Math.max(8, Math.min(window.innerHeight - 120, parsed.y))
          };
        }
      }
    } catch {}
    return {
      x: Math.max(8, window.innerWidth - 240),
      y: 16
    };
  });
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(true);
  const visibilityPanelRef = useRef<HTMLDivElement | null>(null);
  const [visibilityPos, setVisibilityPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 16, y: 340 };
    try {
      const saved = localStorage.getItem('ifraz_visibility_panel_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return {
            x: Math.max(8, Math.min(window.innerWidth - 216, parsed.x)),
            y: Math.max(8, Math.min(window.innerHeight - 260, parsed.y))
          };
        }
      }
    } catch {}
    return {
      x: Math.max(8, window.innerWidth - 216),
      y: Math.min(350, Math.max(70, window.innerHeight - 440))
    };
  });

  // Clamp draggable Görünürlük panel inside viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      const panelEl = visibilityPanelRef.current;
      const w = panelEl?.offsetWidth || 200;
      const h = panelEl?.offsetHeight || 220;
      setVisibilityPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - w - 8, prev.x)),
        y: Math.max(8, Math.min(window.innerHeight - h - 8, prev.y))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleVisibilityDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = visibilityPos.x;
      const origY = visibilityPos.y;
      const panelEl = visibilityPanelRef.current;
      const panelW = panelEl?.offsetWidth || 200;
      const panelH = panelEl?.offsetHeight || 220;
      let latestPos = { x: origX, y: origY };

      const onPointerMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const nextX = Math.max(8, Math.min(window.innerWidth - panelW - 8, origX + dx));
        const nextY = Math.max(8, Math.min(window.innerHeight - panelH - 8, origY + dy));
        latestPos = { x: nextX, y: nextY };
        setVisibilityPos(latestPos);
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        try {
          localStorage.setItem('ifraz_visibility_panel_pos', JSON.stringify(latestPos));
        } catch {}
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [visibilityPos]
  );

  // Clamp draggable CAD & Çizim panel inside viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      const panelEl = cadPanelRef.current;
      const w = panelEl?.offsetWidth || 224;
      const h = panelEl?.offsetHeight || 120;
      setCadPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - w - 8, prev.x)),
        y: Math.max(8, Math.min(window.innerHeight - h - 8, prev.y))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCadDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = cadPos.x;
      const origY = cadPos.y;
      const panelEl = cadPanelRef.current;
      const panelW = panelEl?.offsetWidth || 224;
      const panelH = panelEl?.offsetHeight || 120;
      let latestPos = { x: origX, y: origY };

      const onPointerMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const nextX = Math.max(8, Math.min(window.innerWidth - panelW - 8, origX + dx));
        const nextY = Math.max(8, Math.min(window.innerHeight - panelH - 8, origY + dy));
        latestPos = { x: nextX, y: nextY };
        setCadPos(latestPos);
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        try {
          localStorage.setItem('ifraz_cad_panel_pos', JSON.stringify(latestPos));
        } catch {}
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [cadPos]
  );

  // Dynamic-line CAD vertex editing mode & live drag HUD
  const [dynamicLineMode, setDynamicLineMode] = useState<DynamicLineMode>('auto');
  const dynamicLineModeRef = useRef<DynamicLineMode>('auto');
  const [syncSharedVertices, setSyncSharedVertices] = useState<boolean>(true);
  const syncSharedVerticesRef = useRef<boolean>(true);
  const [vertexDragHud, setVertexDragHud] = useState<{
    parcelName: string;
    vertexIndex: number;
    isNewVertex: boolean;
    activeLineLabel: string | null;
    activeLineColor: string;
    activeLineBearingDeg: number | null;
    snappedToVertex: boolean;
    prevEdgeM: number;
    nextEdgeM: number;
    areaM2: number;
    areaDeltaM2: number;
    displacementM: number;
    lngLat: [number, number];
  } | null>(null);

  useEffect(() => {
    dynamicLineModeRef.current = dynamicLineMode;
  }, [dynamicLineMode]);

  useEffect(() => {
    syncSharedVerticesRef.current = syncSharedVertices;
  }, [syncSharedVertices]);

  // Live measurements HUD during polygon/line drawing
  const [drawingLiveMetrics, setDrawingLiveMetrics] = useState<{
    vertexCount: number;
    currentEdgeLengthM: number;
    totalPerimeterM: number;
    approxAreaM2: number;
    lastVertexCoords?: [number, number];
  } | null>(null);

  // Synchronized setter for activeDrawTool
  const setActiveDrawTool = useCallback(
    (toolOrFn: 'polygon' | 'line' | 'delete' | null | ((prev: 'polygon' | 'line' | 'delete' | null) => 'polygon' | 'line' | 'delete' | null)) => {
      setActiveDrawToolState((prev) => {
        const next = typeof toolOrFn === 'function' ? toolOrFn(prev) : toolOrFn;
        if (onActiveDrawToolChange) {
          onActiveDrawToolChange(next);
        }
        if (next !== 'polygon') {
          setDrawingLiveMetrics(null);
          if (drawMeasurementsGroupRef.current) {
            drawMeasurementsGroupRef.current.clearLayers();
          }
        }
        return next;
      });
    },
    [onActiveDrawToolChange]
  );

  // Sync externalDrawTool changes with internal state
  useEffect(() => {
    if (externalDrawTool !== undefined && externalDrawTool !== activeDrawTool) {
      const map = mapRef.current;
      if (externalDrawTool === 'polygon') {
        handleToggleDrawPolygon(true);
      } else if (externalDrawTool === 'line') {
        handleToggleDrawLine(true);
      } else if (externalDrawTool === 'delete') {
        handleToggleRemovalMode(true);
      } else if (externalDrawTool === null) {
        if (map) {
          map.pm.disableDraw();
          if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
        }
        setActiveDrawToolState(null);
      }
    }
  }, [externalDrawTool]);

  // Active parcel for CAD Vertex Table (falls back to mainPolygon when unsubdivided)
  const cadActiveParcel = useMemo(() => {
    if (parcels.length > 0) {
      if (selectedVertexParcelId) {
        const chosen = parcels.find((p) => p.id === selectedVertexParcelId);
        if (chosen) return chosen;
      }
      if (selectedParcelIds.length > 0) {
        return parcels.find((p) => p.id === selectedParcelIds[0]) || parcels[0];
      }
      return parcels[0];
    }
    if (mainPolygon) {
      let area = 0;
      try {
        area = Math.round(turf.area(mainPolygon) * 10) / 10;
      } catch {}
      return {
        id: 'main-parcel',
        name: 'Ana Parsel',
        feature: mainPolygon,
        areaM2: area
      };
    }
    return null;
  }, [parcels, selectedParcelIds, selectedVertexParcelId, mainPolygon]);

  const activeVertices: ParcelVertex[] = useMemo(() => {
    if (!cadActiveParcel) return [];
    return getParcelVertices(cadActiveParcel.feature);
  }, [cadActiveParcel]);

  const detectedAutoDom = useMemo(() => {
    if (activeVertices.length > 0) {
      return getAutoTurefDom(activeVertices[0].lng);
    }
    return 33;
  }, [activeVertices]);

  const effectiveDom = selectedDom === 'auto' ? detectedAutoDom : selectedDom;

  const utmZoneDisplay = useMemo(() => {
    if (activeVertices.length > 0) {
      return getUtmZoneInfo(activeVertices[0].lng);
    }
    return { zone: 36, centralMeridian: 33, epsg: 'EPSG:5261' };
  }, [activeVertices]);

  // Helper to compute union geometry for visual morphing
  const computeUnionGeometry = (
    geomA: any,
    geomB: any
  ): Feature<Polygon | MultiPolygon> | null => {
    try {
      const featA = (geomA.type === 'Feature' ? geomA : turf.feature(geomA.geometry || geomA)) as Feature<Polygon | MultiPolygon>;
      const featB = (geomB.type === 'Feature' ? geomB : turf.feature(geomB.geometry || geomB)) as Feature<Polygon | MultiPolygon>;

      try {
        const direct = turf.union(turf.featureCollection([featA, featB]));
        if (direct && (direct.geometry.type === 'Polygon' || direct.geometry.type === 'MultiPolygon')) {
          return direct as Feature<Polygon | MultiPolygon>;
        }
      } catch {}

      const bufferedA = turf.buffer(featA, 0.00005, { units: 'kilometers' }) || featA;
      const bufferedB = turf.buffer(featB, 0.00005, { units: 'kilometers' }) || featB;
      const unionResult = turf.union(turf.featureCollection([bufferedA as any, bufferedB as any]));
      if (unionResult) {
        const unbuffered = turf.buffer(unionResult, -0.00005, { units: 'kilometers' });
        return (unbuffered || unionResult) as Feature<Polygon | MultiPolygon>;
      }
    } catch (err) {
      console.warn('computeUnionGeometry warning:', err);
    }
    return null;
  };

  // Fluid visual morphing animation when two parcels are merged via Drag-and-Drop
  const playMergeMorphAnimation = useCallback(
    (
      geomA: any,
      geomB: any,
      unionGeom: any,
      titleInfo: string,
      contactPointGeo: any,
      onApplyMerge: () => void
    ) => {
      const map = mapRef.current;
      const morphGroup = morphAnimationGroupRef.current;
      if (!map || !morphGroup) {
        onApplyMerge();
        return;
      }

      morphGroup.clearLayers();

      try {
        let contactLat = 0;
        let contactLng = 0;

        if (contactPointGeo) {
          try {
            const dropCenter = turf.centerOfMass(contactPointGeo);
            contactLat = dropCenter.geometry.coordinates[1];
            contactLng = dropCenter.geometry.coordinates[0];
          } catch {}
        }

        if (!contactLat && unionGeom) {
          try {
            const uCenter = turf.centerOfMass(unionGeom);
            contactLat = uCenter.geometry.coordinates[1];
            contactLng = uCenter.geometry.coordinates[0];
          } catch {}
        }

        if (!contactLat) {
          const centerA = turf.centerOfMass(geomA);
          const centerB = turf.centerOfMass(geomB);
          contactLat = (centerA.geometry.coordinates[1] + centerB.geometry.coordinates[1]) / 2;
          contactLng = (centerA.geometry.coordinates[0] + centerB.geometry.coordinates[0]) / 2;
        }

        // 1. Contact & Shockwave Ripple expanding from contact point
        const shockwaveIcon = L.divIcon({
          className: 'morph-shockwave-wrapper',
          html: '<div class="morph-shockwave-circle" style="width: 140px; height: 140px; margin-left: -70px; margin-top: -70px;"></div>',
          iconSize: [0, 0]
        });
        L.marker([contactLat, contactLng], {
          icon: shockwaveIcon,
          pane: 'morphPane',
          interactive: false
        }).addTo(morphGroup);

        // 2. Individual Shapes A and B with glowing cyan and emerald animated vectors
        L.geoJSON(geomA, {
          pane: 'morphPane',
          style: {
            color: '#06b6d4',
            weight: 4.5,
            dashArray: '10, 6',
            fillColor: '#0891b2',
            fillOpacity: 0.35,
            className: 'morph-anim-path'
          }
        }).addTo(morphGroup);

        L.geoJSON(geomB, {
          pane: 'morphPane',
          style: {
            color: '#10b981',
            weight: 4.5,
            dashArray: '10, 6',
            fillColor: '#059669',
            fillOpacity: 0.35,
            className: 'morph-anim-path'
          }
        }).addTo(morphGroup);

        // 3. Fused Combined Geometry Morph Layer (seamless boundary taking over)
        if (unionGeom) {
          L.geoJSON(unionGeom, {
            pane: 'morphPane',
            style: {
              color: '#34d399',
              weight: 5.5,
              dashArray: '14, 7',
              fillColor: '#10b981',
              fillOpacity: 0.45,
              className: 'morph-combined-path'
            }
          }).addTo(morphGroup);
        }

        // 4. Floating Holographic Celebration Badge with Sparkles
        const celebrationIcon = L.divIcon({
          className: 'morph-badge-wrapper',
          html: `
            <div class="relative flex flex-col items-center justify-center pointer-events-none select-none">
              <div class="morph-celebration-badge px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.7)] backdrop-blur-md text-white text-[12px] font-bold tracking-wide flex items-center gap-2 whitespace-nowrap">
                <span class="text-base text-emerald-400">✨</span>
                <span class="text-emerald-300 font-extrabold">${titleInfo}</span>
                <span class="text-[10px] bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded px-1.5 py-0.5">Tevhit ✓</span>
              </div>
              <span class="morph-sparkle-item text-emerald-300" style="left: -24px; top: -14px; animation-delay: 0.05s;">✨</span>
              <span class="morph-sparkle-item text-amber-300" style="right: -24px; top: -16px; animation-delay: 0.2s;">🌟</span>
              <span class="morph-sparkle-item text-cyan-300" style="left: 14px; top: -28px; animation-delay: 0.35s;">⚡</span>
            </div>
          `,
          iconSize: [0, 0]
        });
        L.marker([contactLat, contactLng], {
          icon: celebrationIcon,
          pane: 'morphPane',
          interactive: false
        }).addTo(morphGroup);

        // Trigger permanent state merge at 380ms while morph paths are actively flowing
        setTimeout(() => {
          onApplyMerge();
        }, 380);

        // Seamlessly clear temporary animation layers after sequence finishes
        setTimeout(() => {
          if (morphAnimationGroupRef.current) {
            morphAnimationGroupRef.current.clearLayers();
          }
        }, 1350);
      } catch (err) {
        console.warn('playMergeMorphAnimation exception:', err);
        onApplyMerge();
      }
    },
    []
  );

  // Initialize Map & Geoman Controls
  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map-element', {
        zoomControl: false,
        zoomAnimation: true,
        maxZoom: 28
      }).setView([39.0, 35.0], 6);

      mapRef.current = map;

      // Custom Panes for strict Z-index ordering
      map.createPane('ifrazPane');
      map.getPane('ifrazPane')!.style.zIndex = '650';

      map.createPane('roadPane');
      map.getPane('roadPane')!.style.zIndex = '655';

      map.createPane('labelPane');
      map.getPane('labelPane')!.style.zIndex = '660';

      map.createPane('vertexPane');
      map.getPane('vertexPane')!.style.zIndex = '670';

      map.createPane('morphPane');
      map.getPane('morphPane')!.style.zIndex = '680';

      map.createPane('cadGuidePane');
      map.getPane('cadGuidePane')!.style.zIndex = '685';

      map.createPane('drawMeasurementPane');
      map.getPane('drawMeasurementPane')!.style.zIndex = '690';

      map.createPane('cadVertexPane');
      map.getPane('cadVertexPane')!.style.zIndex = '695';

      mainLayerGroupRef.current = L.layerGroup().addTo(map);
      secondaryParcelsGroupRef.current = L.layerGroup().addTo(map);
      piecesLayerGroupRef.current = L.layerGroup().addTo(map);
      edgeLabelsGroupRef.current = L.layerGroup().addTo(map);
      axisLineLayerRef.current = L.layerGroup().addTo(map);
      cutAngleLayerGroupRef.current = L.layerGroup().addTo(map);
      roadLinesGroupRef.current = L.layerGroup().addTo(map);
      frontageEdgeGroupRef.current = L.layerGroup().addTo(map);
      vertexMarkersGroupRef.current = L.layerGroup().addTo(map);
      morphAnimationGroupRef.current = L.layerGroup().addTo(map);
      drawMeasurementsGroupRef.current = L.layerGroup().addTo(map);
      cadGuideLayerGroupRef.current = L.layerGroup().addTo(map);
      cadVertexLayerGroupRef.current = L.layerGroup().addTo(map);

      // Translate Geoman Drawing Controls to Turkish
      try {
        if (typeof (map.pm as any).setLang === 'function') {
          (map.pm as any).setLang('tr', {
            tooltips: {
              placeMarker: 'İşaretçi koymak için tıklayın',
              firstVertex: 'İlk köşeyi koymak için tıklayın',
              continueLine: 'Çizgiye devam etmek için tıklayın',
              finishLine: 'Çizgiyi bitirmek için son noktaya tıklayın',
              finishPoly: 'Poligonu kapatmak için ilk noktaya tıklayın',
              finishRect: 'Dikdörtgeni bitirmek için tıklayın',
              startCircle: 'Daire çizmek için tıklayın',
              finishCircle: 'Daireyi bitirmek için tıklayın',
              placeCircleMarker: 'Daire işaretçisi yerleştirmek için tıklayın',
            },
            actions: {
              finish: 'Tamamla',
              cancel: 'İptal',
              removeLastVertex: 'Son Köşeyi Sil',
            },
            buttonTitles: {
              drawMarkerButton: 'İşaretçi Çiz',
              drawPolyButton: 'Parsel / Poligon Çiz',
              drawLineButton: 'İmar Yolu / Çizgi Çiz',
              drawCircleButton: 'Daire Çiz',
              drawRectButton: 'Dikdörtgen Çiz',
              editButton: 'Katmanları / Köşeleri Düzenle',
              dragButton: 'Katmanları Taşı',
              cutButton: 'Poligon Kes',
              deleteButton: 'Katman / Parsel Sil',
              drawCircleMarkerButton: 'Daire İşaretçisi Çiz',
              snappingButton: 'Kenetlenmeyi (Snapping) Aç/Kapat',
              pinningButton: 'Bağlı Köşeleri Birlikte Taşı (Pinning)'
            }
          }, 'en');
        }
      } catch (langErr) {
        console.warn('Geoman setLang hatası:', langErr);
      }

      // Track Geoman drawing and removal states
      map.on('pm:drawend', () => {
        setActiveDrawTool((prev) => (prev === 'delete' ? prev : null));
        setDrawingLiveMetrics(null);
        if (drawMeasurementsGroupRef.current) {
          drawMeasurementsGroupRef.current.clearLayers();
        }
      });
      map.on('pm:globalremovalmodetoggled', (e: any) => {
        setActiveDrawTool(e.enabled ? 'delete' : null);
      });

      // Dynamic real-time distance and area measurements during polygon drawing
      const updateDrawingMetrics = (currentMouseLatLng?: L.LatLng) => {
        const drawInstance = (map.pm.Draw as any)?.Polygon;
        if (!drawInstance || !drawInstance.enabled()) {
          return;
        }

        const rawPoly = drawInstance._layer;
        let coords: L.LatLng[] = [];
        if (rawPoly && typeof rawPoly.getLatLngs === 'function') {
          const latlngs = rawPoly.getLatLngs();
          coords = Array.isArray(latlngs[0]) ? [...(latlngs[0] as L.LatLng[])] : [...(latlngs as L.LatLng[])];
        }

        const measureGroup = drawMeasurementsGroupRef.current;
        if (measureGroup) {
          measureGroup.clearLayers();
        }

        // Render persistent distance tooltips on already committed edges
        let committedPerimeter = 0;
        if (coords.length >= 2 && measureGroup) {
          for (let i = 0; i < coords.length - 1; i++) {
            const p1 = coords[i];
            const p2 = coords[i + 1];
            const dist = p1.distanceTo(p2);
            committedPerimeter += dist;

            const midLat = (p1.lat + p2.lat) / 2;
            const midLng = (p1.lng + p2.lng) / 2;
            const badgeIcon = L.divIcon({
              className: 'draw-edge-measure-wrapper',
              html: `<div class="draw-edge-measure-tooltip">K${i + 1}-K${i + 2}: ${dist.toFixed(1)} m</div>`,
              iconSize: [0, 0]
            });
            L.marker([midLat, midLng], {
              icon: badgeIcon,
              pane: 'drawMeasurementPane',
              interactive: false
            }).addTo(measureGroup);
          }
        }

        // Compute current live edge to mouse cursor
        let liveEdgeM = 0;
        let totalPerimeter = committedPerimeter;
        let currentArea = 0;

        const pointsForArea: [number, number][] = coords.map((c) => [c.lng, c.lat]);

        if (currentMouseLatLng && coords.length > 0) {
          const lastCoord = coords[coords.length - 1];
          liveEdgeM = lastCoord.distanceTo(currentMouseLatLng);
          totalPerimeter += liveEdgeM;
          pointsForArea.push([currentMouseLatLng.lng, currentMouseLatLng.lat]);

          // Also render live edge tooltip
          if (measureGroup) {
            const midLat = (lastCoord.lat + currentMouseLatLng.lat) / 2;
            const midLng = (lastCoord.lng + currentMouseLatLng.lng) / 2;
            const liveIcon = L.divIcon({
              className: 'draw-edge-measure-wrapper',
              html: `<div class="draw-edge-measure-tooltip" style="border-color: #38bdf8; background: rgba(2, 132, 199, 0.95); color: #fff;">${liveEdgeM.toFixed(1)} m (anlık)</div>`,
              iconSize: [0, 0]
            });
            L.marker([midLat, midLng], {
              icon: liveIcon,
              pane: 'drawMeasurementPane',
              interactive: false
            }).addTo(measureGroup);
          }
        }

        // Calculate polygon area if at least 3 vertices
        if (pointsForArea.length >= 3) {
          try {
            const ring = [...pointsForArea];
            if (
              ring[0][0] !== ring[ring.length - 1][0] ||
              ring[0][1] !== ring[ring.length - 1][1]
            ) {
              ring.push(ring[0]);
            }
            const turfPoly = turf.polygon([ring]);
            currentArea = turf.area(turfPoly);
          } catch {}
        }

        setDrawingLiveMetrics({
          vertexCount: coords.length,
          currentEdgeLengthM: liveEdgeM,
          totalPerimeterM: totalPerimeter,
          approxAreaM2: currentArea,
          lastVertexCoords: coords.length > 0 ? [coords[coords.length - 1].lat, coords[coords.length - 1].lng] : undefined
        });
      };

      map.on('mousemove', (e: L.LeafletMouseEvent) => {
        if ((map.pm.Draw as any)?.Polygon?.enabled()) {
          updateDrawingMetrics(e.latlng);
        }
      });

      map.on('pm:drawstart', () => {
        updateDrawingMetrics();
      });

      map.on('pm:vertexadded', () => {
        updateDrawingMetrics();
      });

      map.on('pm:snap', (e: any) => {
        if (e.snapLatLng && (map.pm.Draw as any)?.Polygon?.enabled()) {
          updateDrawingMetrics(e.snapLatLng);
        }
      });

      // Handle Geoman drawing completion
      map.on('pm:create', (e: any) => {
        if (!e.layer) return;
        const geo = e.layer.toGeoJSON();

        // Check if CAD Slice tool is active
        if (mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice' && geo.geometry.type === 'LineString') {
          // Find which parcel intersects this cut line
          let targetParcelId: string | null = null;
          if (cadActiveParcel) {
            targetParcelId = cadActiveParcel.id;
          } else {
            for (const p of parcels) {
              try {
                if (turf.booleanIntersects(geo, p.feature)) {
                  targetParcelId = p.id;
                  break;
                }
              } catch (err) {
                console.warn('Slice intersection check error:', err);
              }
            }
          }

          if (targetParcelId && onParcelSliced) {
            onParcelSliced(targetParcelId, geo as Feature<LineString>);
          }
          map.removeLayer(e.layer);
          return;
        }

        if (e.shape === 'Line' || e.shape === 'Polyline') {
          if (onRoadLineCreated && geo.geometry.type === 'LineString') {
            onRoadLineCreated(geo as Feature<LineString>);
          }
        } else if (e.shape === 'Polygon' || e.shape === 'Rectangle') {
          if (onPolygonCreated) {
            onPolygonCreated(geo as ParcelGeometry);
          }
        }

        setActiveDrawTool(null);
        map.pm.disableDraw();
        map.removeLayer(e.layer);
      });

      // Handle map window resize smoothly
      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      const mapElem = document.getElementById('map-element');
      if (mapElem) resizeObserver.observe(mapElem);
    }
  }, [onPolygonCreated, onRoadLineCreated, mapSettings.cadModeActive, mapSettings.cadActiveTool, cadActiveParcel, parcels, onParcelSliced]);

  // Handle TKGM Map-Click, Obje Sor Query, and Sil Delete Cursor/Map Click
  useEffect(() => {
    const map = mapRef.current;
    const container = map?.getContainer();
    if (!map) return;

    if (container) {
      if (isPickingTkgmParcel) {
        container.style.cursor = 'crosshair';
      } else if (isObjectQueryActive) {
        container.style.cursor = 'help';
      } else if (activeDrawTool === 'delete') {
        container.style.cursor = 'crosshair';
      } else {
        container.style.cursor = '';
      }
    }

    const handleSpecialMapClick = (e: L.LeafletMouseEvent) => {
      if (!e.latlng) return;
      if (isPickingTkgmParcel && onPickTkgmCoord) {
        onPickTkgmCoord(e.latlng.lat, e.latlng.lng);
        return;
      }
      if (isObjectQueryActive) {
        setInspectedObject({
          kind: 'map-point',
          title: 'Harita Koordinat Noktası',
          subtitle: 'Detaylı bilgi için parsel veya çizgi üzerine de tıklayabilirsiniz',
          latlng: [e.latlng.lat, e.latlng.lng]
        });
      }
    };

    if (isPickingTkgmParcel || isObjectQueryActive) {
      map.on('click', handleSpecialMapClick);
    }
    return () => {
      map.off('click', handleSpecialMapClick);
      if (container) {
        container.style.cursor = '';
      }
    };
  }, [isPickingTkgmParcel, onPickTkgmCoord, isObjectQueryActive, activeDrawTool]);

  // Handle CAD Slice Tool Activation in Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice') {
      map.pm.enableDraw('Line', {
        snappable: true,
        snapDistance: 20,
        tooltips: true,
        templineStyle: { color: '#ef4444', dashArray: '6, 6', weight: 3 }
      });
    } else if (!activeDrawTool) {
      map.pm.disableDraw();
    }
  }, [mapSettings.cadModeActive, mapSettings.cadActiveTool, activeDrawTool]);

  // Update Tile Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let newTileLayer: L.Layer;

    switch (mapSettings.tileProvider) {
      case 'googleSatellite':
        newTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          maxZoom: 28,
          maxNativeZoom: 20,
          attribution: 'Google Satellite'
        });
        break;
      case 'osm':
        newTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: 'OpenStreetMap'
        });
        break;
      case 'googleHybrid':
      default:
        newTileLayer = L.layerGroup([
          L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 28, maxNativeZoom: 20 }),
          L.tileLayer('https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}', { maxZoom: 28, maxNativeZoom: 20, attribution: 'Google Hybrid' })
        ]);
        break;
    }

    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [mapSettings.tileProvider]);

  // Render Main Cadastral Boundary (with CAD Vertex Editing when unsubdivided)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mainLayerGroupRef.current) return;

    mainLayerGroupRef.current.clearLayers();

    if (mainPolygon) {
      const isMainVertexEditable =
        mapSettings.cadModeActive &&
        mapSettings.cadActiveTool === 'vertex' &&
        parcels.length === 0;
      const isDragMergeActive = !!mapSettings.enableDragMerge && !mapSettings.cadModeActive;

      const geoLayer = L.geoJSON(mainPolygon, {
        style: {
          color: isMainVertexEditable ? '#10b981' : isDragMergeActive ? '#10b981' : '#16a34a',
          weight: isMainVertexEditable || isDragMergeActive ? 4 : 3.5,
          dashArray: isMainVertexEditable ? '4, 2' : isDragMergeActive ? '6, 4' : '4, 4',
          fillColor: '#22c55e',
          fillOpacity: isMainVertexEditable ? 0.18 : 0.12
        }
      }).addTo(mainLayerGroupRef.current);

      geoLayer.on('click', (e) => {
        if (isPickingTkgmRef.current) return;
        if (activeDrawToolRef.current === 'delete') {
          L.DomEvent.stopPropagation(e);
          onClearMainPolygonRef.current?.();
          return;
        }
        if (isObjectQueryRef.current) {
          L.DomEvent.stopPropagation(e);
          const verts = getParcelVertices(mainPolygon);
          const edgeLengthsM = verts.map((v) => v.lengthToNextM);
          const perimeterM = edgeLengthsM.reduce((a, b) => a + b, 0);
          let areaM2 = 0;
          try {
            areaM2 = turf.area(mainPolygon);
          } catch {}
          const cInfo = cadastralInfoRef.current;
          setInspectedObject({
            kind: 'main-parcel',
            id: 'main-parcel',
            title: cInfo?.adaNo || cInfo?.parselNo ? `Ana Parsel (${cInfo.adaNo}/${cInfo.parselNo})` : 'Ana Parsel',
            subtitle: 'Kadastro Ana Sınırı',
            areaM2,
            perimeterM,
            vertexCount: verts.length,
            edgeLengthsM,
            il: cInfo?.il,
            ilce: cInfo?.ilce,
            mahalle: cInfo?.mahalle,
            adaNo: cInfo?.adaNo,
            parselNo: cInfo?.parselNo,
            latlng: [e.latlng.lat, e.latlng.lng]
          });
        }
      });

      if (!isMainVertexEditable && isDragMergeActive && secondaryParcels.length > 0) {
        geoLayer.eachLayer((subLayer: any) => {
          if (subLayer.pm) {
            subLayer.pm.enableLayerDrag();

            subLayer.on('pm:dragend', () => {
              const droppedGeo = subLayer.toGeoJSON();
              let targetParcelId: string | null = null;

              for (const other of secondaryParcels) {
                try {
                  const buffered = turf.buffer(droppedGeo, 0.002, { units: 'kilometers' }) || droppedGeo;
                  if (turf.booleanIntersects(buffered, other.geometry)) {
                    targetParcelId = other.id;
                    break;
                  }
                } catch (err) {
                  console.warn('Tevhit sürükleme kesişim kontrolü hatası:', err);
                }
              }

              if (targetParcelId && onDragMergeLoadedParcels) {
                const targetSec = secondaryParcels.find((p) => p.id === targetParcelId);
                const targetGeom = targetSec ? targetSec.geometry : null;
                const unionGeom = targetGeom ? computeUnionGeometry(mainPolygon, targetGeom) : null;
                const approxArea = Math.round(turf.area(unionGeom || mainPolygon));
                const targetLabel = targetSec ? `${targetSec.cadastralInfo.adaNo}/${targetSec.cadastralInfo.parselNo}` : 'Parsel';
                const title = `Ana Parsel + ${targetLabel}: ${approxArea.toLocaleString('tr-TR')} m²`;

                try {
                  subLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                } catch {}

                playMergeMorphAnimation(mainPolygon, targetGeom || droppedGeo, unionGeom, title, droppedGeo, () => {
                  onDragMergeLoadedParcels('main', targetParcelId!);
                });
              } else {
                // Reset position to original
                try {
                  const tempGroup = L.geoJSON(mainPolygon);
                  const origSub = tempGroup.getLayers()[0] as L.Polygon;
                  if (origSub && origSub.getLatLngs) {
                    subLayer.setLatLngs(origSub.getLatLngs());
                  }
                } catch {}
              }
            });
          }
        });
      }

      if (!skipFitBoundsRef.current && !mapSettings.cadModeActive) {
        map.fitBounds(geoLayer.getBounds(), { padding: [40, 40] });
      } else {
        skipFitBoundsRef.current = false;
      }
    }
  }, [
    mainPolygon,
    parcels.length,
    mapSettings.enableDragMerge,
    mapSettings.cadModeActive,
    mapSettings.cadActiveTool,
    secondaryParcels,
    onDragMergeLoadedParcels,
    onMainPolygonUpdated,
    playMergeMorphAnimation
  ]);

  // Render Secondary (Non-active) Loaded Cadastral Parcels from other KML files
  useEffect(() => {
    if (!secondaryParcelsGroupRef.current) return;
    secondaryParcelsGroupRef.current.clearLayers();

    if (!secondaryParcels || secondaryParcels.length === 0) return;

    const isDragMergeActive = !!mapSettings.enableDragMerge && !mapSettings.cadModeActive;

    secondaryParcels.forEach((sp) => {
      const geoLayer = L.geoJSON(sp.geometry, {
        style: {
          color: isDragMergeActive ? '#f59e0b' : '#38bdf8',
          weight: isDragMergeActive ? 3 : 2,
          dashArray: isDragMergeActive ? '4, 4' : '5, 5',
          fillColor: isDragMergeActive ? '#f59e0b' : '#0284c7',
          fillOpacity: isDragMergeActive ? 0.25 : 0.12
        }
      }).addTo(secondaryParcelsGroupRef.current!);

      geoLayer.on('click', (e) => {
        if (isPickingTkgmRef.current) return;
        if (activeDrawToolRef.current === 'delete') {
          L.DomEvent.stopPropagation(e);
          onDeleteSecondaryParcelRef.current?.(sp.id);
          return;
        }
        if (isObjectQueryRef.current) {
          L.DomEvent.stopPropagation(e);
          const verts = getParcelVertices(sp.geometry);
          const edgeLengthsM = verts.map((v) => v.lengthToNextM);
          const perimeterM = edgeLengthsM.reduce((a, b) => a + b, 0);
          setInspectedObject({
            kind: 'secondary-parcel',
            id: sp.id,
            title: `Parsel ${sp.cadastralInfo.adaNo}/${sp.cadastralInfo.parselNo}`,
            subtitle: 'Yüklü Kadastro Parseli',
            areaM2: sp.areaM2,
            perimeterM,
            vertexCount: verts.length,
            edgeLengthsM,
            il: sp.cadastralInfo.il,
            ilce: sp.cadastralInfo.ilce,
            mahalle: sp.cadastralInfo.mahalle,
            adaNo: sp.cadastralInfo.adaNo,
            parselNo: sp.cadastralInfo.parselNo,
            soilClass: sp.soilClassification?.soilClass,
            vs30: sp.soilClassification?.vs30,
            bearingCapacity: sp.soilClassification?.bearingCapacityKgCm2,
            avgSlopePercent: sp.topography?.avgSlopePercent,
            aspect: sp.topography?.aspect,
            elevationDiffM: sp.topography?.elevationDiffM,
            latlng: [e.latlng.lat, e.latlng.lng]
          });
          return;
        }
        if (!isDragMergeActive && onSelectActiveParcel) {
          onSelectActiveParcel(sp);
        }
      });

      if (isDragMergeActive) {
        geoLayer.bindTooltip(`Tevhit için sürükleyin: ${sp.cadastralInfo.adaNo}/${sp.cadastralInfo.parselNo}`, {
          direction: 'top',
          className: 'bg-amber-950 text-amber-300 font-semibold text-[11px] border border-amber-500 rounded px-2 py-0.5 shadow'
        });

        geoLayer.eachLayer((subLayer: any) => {
          if (subLayer.pm) {
            subLayer.pm.enableLayerDrag();

            subLayer.on('pm:dragend', () => {
              const droppedGeo = subLayer.toGeoJSON();
              let targetParcelId: string | null = null;

              // Check intersection with mainPolygon
              if (mainPolygon) {
                try {
                  const buffered = turf.buffer(droppedGeo, 0.002, { units: 'kilometers' }) || droppedGeo;
                  if (turf.booleanIntersects(buffered, mainPolygon)) {
                    targetParcelId = 'main';
                  }
                } catch (err) {
                  console.warn('Tevhit sürükleme kontrolü:', err);
                }
              }

              // Check intersection with other secondary parcels
              if (!targetParcelId) {
                for (const other of secondaryParcels) {
                  if (other.id === sp.id) continue;
                  try {
                    const buffered = turf.buffer(droppedGeo, 0.002, { units: 'kilometers' }) || droppedGeo;
                    if (turf.booleanIntersects(buffered, other.geometry)) {
                      targetParcelId = other.id;
                      break;
                    }
                  } catch (err) {
                    console.warn('Tevhit sürükleme kontrolü:', err);
                  }
                }
              }

              if (targetParcelId && onDragMergeLoadedParcels) {
                let targetGeom: any = null;
                let targetLabel = '';
                if (targetParcelId === 'main') {
                  targetGeom = mainPolygon;
                  targetLabel = 'Ana Parsel';
                } else {
                  const other = secondaryParcels.find((o) => o.id === targetParcelId);
                  targetGeom = other ? other.geometry : null;
                  targetLabel = other ? `${other.cadastralInfo.adaNo}/${other.cadastralInfo.parselNo}` : 'Parsel';
                }

                const unionGeom = targetGeom ? computeUnionGeometry(sp.geometry, targetGeom) : null;
                const approxArea = Math.round(turf.area(unionGeom || sp.geometry));
                const title = `${sp.cadastralInfo.adaNo}/${sp.cadastralInfo.parselNo} + ${targetLabel}: ${approxArea.toLocaleString('tr-TR')} m²`;

                try {
                  subLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                } catch {}

                playMergeMorphAnimation(sp.geometry, targetGeom || droppedGeo, unionGeom, title, droppedGeo, () => {
                  onDragMergeLoadedParcels(sp.id, targetParcelId!);
                });
              } else {
                // Reset position to original
                try {
                  const tempGroup = L.geoJSON(sp.geometry);
                  const origSub = tempGroup.getLayers()[0] as L.Polygon;
                  if (origSub && origSub.getLatLngs) {
                    subLayer.setLatLngs(origSub.getLatLngs());
                  }
                } catch {}
              }
            });
          }
        });
      }

      try {
        const center = turf.centerOfMass(sp.geometry);
        const [cLng, cLat] = center.geometry.coordinates;
        const marker = L.marker([cLat, cLng], {
          pane: 'labelPane',
          interactive: true,
          icon: L.divIcon({
            className: 'secondary-parcel-badge',
            html: `<div class="px-2 py-0.5 rounded-full ${
              isDragMergeActive
                ? 'bg-amber-900/90 text-amber-200 border-amber-500 animate-pulse'
                : 'bg-slate-900/90 text-cyan-300 border-cyan-500/40'
            } font-mono text-[10px] font-bold border shadow cursor-pointer hover:bg-cyan-600 hover:text-white transition">${sp.cadastralInfo.adaNo}/${sp.cadastralInfo.parselNo}</div>`,
            iconSize: [60, 20],
            iconAnchor: [30, 10]
          })
        });
        marker.on('click', (e) => {
          if (isPickingTkgmRef.current) return;
          if (activeDrawToolRef.current === 'delete') {
            L.DomEvent.stopPropagation(e);
            onDeleteSecondaryParcelRef.current?.(sp.id);
            return;
          }
          if (isObjectQueryRef.current) {
            L.DomEvent.stopPropagation(e);
            const verts = getParcelVertices(sp.geometry);
            const edgeLengthsM = verts.map((v) => v.lengthToNextM);
            const perimeterM = edgeLengthsM.reduce((a, b) => a + b, 0);
            setInspectedObject({
              kind: 'secondary-parcel',
              id: sp.id,
              title: `Parsel ${sp.cadastralInfo.adaNo}/${sp.cadastralInfo.parselNo}`,
              subtitle: 'Yüklü Kadastro Parseli',
              areaM2: sp.areaM2,
              perimeterM,
              vertexCount: verts.length,
              edgeLengthsM,
              il: sp.cadastralInfo.il,
              ilce: sp.cadastralInfo.ilce,
              mahalle: sp.cadastralInfo.mahalle,
              adaNo: sp.cadastralInfo.adaNo,
              parselNo: sp.cadastralInfo.parselNo,
              soilClass: sp.soilClassification?.soilClass,
              vs30: sp.soilClassification?.vs30,
              bearingCapacity: sp.soilClassification?.bearingCapacityKgCm2,
              avgSlopePercent: sp.topography?.avgSlopePercent,
              aspect: sp.topography?.aspect,
              elevationDiffM: sp.topography?.elevationDiffM,
              latlng: [e.latlng.lat, e.latlng.lng]
            });
            return;
          }
          if (onSelectActiveParcel) onSelectActiveParcel(sp);
        });
        secondaryParcelsGroupRef.current!.addLayer(marker);
      } catch {}
    });
  }, [secondaryParcels, onSelectActiveParcel, mapSettings.enableDragMerge, mapSettings.cadModeActive, mapSettings.showCadastre, mainPolygon, onDragMergeLoadedParcels, playMergeMorphAnimation]);

  // Render Road Lines
  useEffect(() => {
    if (!roadLinesGroupRef.current) return;
    roadLinesGroupRef.current.clearLayers();

    roadLines.forEach((rl, i) => {
      const lineLayer = L.geoJSON(rl, {
        pane: 'roadPane',
        style: {
          color: '#f59e0b',
          weight: 5,
          dashArray: '10, 6'
        }
      }).addTo(roadLinesGroupRef.current!);

      lineLayer.bindTooltip(`🛣️ İmar / Yol Cephesi ${i + 1}`, {
        permanent: true,
        direction: 'center',
        className: 'bg-amber-900/90 text-amber-200 border border-amber-600 font-bold text-[10px] px-1.5 py-0.5 rounded shadow'
      });

      lineLayer.on('click', (e) => {
        if (isPickingTkgmRef.current) return;
        if (activeDrawToolRef.current === 'delete') {
          L.DomEvent.stopPropagation(e);
          onDeleteRoadLineRef.current?.(i);
          return;
        }
        if (isObjectQueryRef.current) {
          L.DomEvent.stopPropagation(e);
          let lengthM = 0;
          try {
            lengthM = turf.length(rl, { units: 'meters' });
          } catch {}
          setInspectedObject({
            kind: 'road-line',
            roadIndex: i,
            title: `İmar / Yol Cephesi ${i + 1}`,
            subtitle: 'Çizilen Yol Güzergahı',
            lengthM,
            vertexCount: rl.geometry?.coordinates?.length || 0,
            latlng: [e.latlng.lat, e.latlng.lng]
          });
        }
      });
    });
  }, [roadLines]);

  // Render Frontage Edges (Yol Cephesi Seçimi & Gösterimi)
  useEffect(() => {
    if (!frontageEdgeGroupRef.current) return;
    frontageEdgeGroupRef.current.clearLayers();

    if (!mainPolygon) return;

    const edges = getMainPolygonEdges(mainPolygon);
    const activeWestIdx = westEdgeIndex ?? leftSideEdgeIndex;
    const activeEastIdx = eastEdgeIndex ?? rightSideEdgeIndex;

    edges.forEach((edge) => {
      const isSelected = selectedFrontageEdgeIndices.includes(edge.index);
      const isWestEdge = activeWestIdx !== undefined && activeWestIdx === edge.index;
      const isEastEdge = activeEastIdx !== undefined && activeEastIdx === edge.index;
      const isSelecting = isSelectingFrontageEdge || (edgeSelectionMode !== undefined && edgeSelectionMode !== 'none');

      // Only draw if selecting mode is active, or if this edge is selected as road or west/east edge
      if (!isSelecting && !isSelected && !isWestEdge && !isEastEdge) return;

      const latlngs: [number, number][] = [
        [edge.p1[1], edge.p1[0]],
        [edge.p2[1], edge.p2[0]]
      ];

      let edgeColor = '#38bdf8';
      let edgeWeight = 4;
      if (isSelected) {
        edgeColor = '#f59e0b'; // Amber / Gold for Road
        edgeWeight = 6.5;
      } else if (isWestEdge) {
        edgeColor = '#3b82f6'; // Bright Blue for Sol (Batı)
        edgeWeight = 6.0;
      } else if (isEastEdge) {
        edgeColor = '#a855f7'; // Purple for Sağ (Doğu)
        edgeWeight = 6.0;
      }

      const polyline = L.polyline(latlngs, {
        pane: 'roadPane',
        color: edgeColor,
        weight: edgeWeight,
        dashArray: isSelected || isWestEdge || isEastEdge ? undefined : '6, 6',
        opacity: isSelected || isWestEdge || isEastEdge ? 1 : 0.85
      }).addTo(frontageEdgeGroupRef.current!);

      if (isSelecting) {
        let tooltipText = `Tıkla: Kenar #${edge.index + 1} (${edge.lengthM}m)`;
        let tooltipClass = 'bg-slate-900/90 text-white font-semibold text-[11px] px-2 py-1 rounded-md border border-sky-400 shadow';

        if (edgeSelectionMode === 'left') {
          tooltipText = isWestEdge
            ? `Seçili Sol Kenar (Batı): #${edge.index + 1} (${edge.lengthM}m)`
            : `Tıkla: Sol Kenar (Batı) Olarak Seç (#${edge.index + 1} - ${edge.lengthM}m)`;
          tooltipClass = 'bg-blue-600 text-white font-bold text-[11px] px-2 py-1 rounded-md border border-blue-300 shadow';
        } else if (edgeSelectionMode === 'right') {
          tooltipText = isEastEdge
            ? `Seçili Sağ Kenar (Doğu): #${edge.index + 1} (${edge.lengthM}m)`
            : `Tıkla: Sağ Kenar (Doğu) Olarak Seç (#${edge.index + 1} - ${edge.lengthM}m)`;
          tooltipClass = 'bg-purple-600 text-white font-bold text-[11px] px-2 py-1 rounded-md border border-purple-300 shadow';
        } else {
          // Road selection mode
          tooltipText = isSelected
            ? `Seçili Yol Cephesi: Çıkarmak için tıkla (#${edge.index + 1} - ${edge.lengthM}m)`
            : `Tıkla: Yol Cephesine Ekle (#${edge.index + 1} - ${edge.lengthM}m)`;
          tooltipClass = isSelected
            ? 'bg-amber-500 text-slate-950 font-bold text-[11px] px-2 py-1 rounded-md border border-amber-300 shadow'
            : 'bg-slate-900/90 text-white font-semibold text-[11px] px-2 py-1 rounded-md border border-sky-400 shadow';
        }

        polyline.bindTooltip(tooltipText, {
          sticky: true,
          direction: 'top',
          className: tooltipClass
        });

        polyline.on('mouseover', () => {
          polyline.setStyle({
            weight: 7.5,
            color: edgeSelectionMode === 'left' ? '#60a5fa' : edgeSelectionMode === 'right' ? '#c084fc' : '#f59e0b',
            opacity: 1
          });
        });
        polyline.on('mouseout', () => {
          polyline.setStyle({
            weight: edgeWeight,
            color: edgeColor,
            opacity: 1
          });
        });
        polyline.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (onSelectEdgeForMode && edgeSelectionMode !== 'none') {
            onSelectEdgeForMode(edgeSelectionMode, edge.index);
          } else if (onToggleFrontageEdge) {
            onToggleFrontageEdge(edge.index);
          }
        });
      } else if (isSelected) {
        polyline.bindTooltip(`🛣️ Yol Cephesi #${edge.index + 1} (${edge.lengthM}m)`, {
          permanent: true,
          direction: 'center',
          className: 'bg-amber-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded shadow-lg border border-amber-300'
        });
      } else if (isWestEdge) {
        polyline.bindTooltip(`📐 Sol Kenar (Batı) #${edge.index + 1} (${edge.lengthM}m)`, {
          permanent: true,
          direction: 'center',
          className: 'bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow-lg border border-blue-400'
        });
      } else if (isEastEdge) {
        polyline.bindTooltip(`📐 Sağ Kenar (Doğu) #${edge.index + 1} (${edge.lengthM}m)`, {
          permanent: true,
          direction: 'center',
          className: 'bg-purple-600 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow-lg border border-purple-400'
        });
      }
    });
  }, [mainPolygon, isSelectingFrontageEdge, edgeSelectionMode, selectedFrontageEdgeIndices, westEdgeIndex, eastEdgeIndex, leftSideEdgeIndex, rightSideEdgeIndex, onToggleFrontageEdge, onSelectEdgeForMode]);

  // Render Axis Line for Double Row
  useEffect(() => {
    if (!axisLineLayerRef.current) return;
    axisLineLayerRef.current.clearLayers();

    if (axisConfig?.isDoubleRow && mainPolygon) {
      const bbox = turf.bbox(mainPolygon);
      const posRatio = Math.max(0.1, Math.min(0.9, axisConfig.axisPosition / 100));
      const splitY = bbox[1] + (bbox[3] - bbox[1]) * posRatio;

      const axisLine = turf.lineString([
        [bbox[0] - 0.01, splitY],
        [bbox[2] + 0.01, splitY]
      ]);

      const rotatedAxis = turf.transformRotate(axisLine, axisConfig.angle, {
        pivot: turf.point([(bbox[0] + bbox[2]) / 2, splitY])
      });

      L.geoJSON(rotatedAxis, {
        style: { color: '#dc2626', weight: 3.5, dashArray: '8, 8' }
      }).addTo(axisLineLayerRef.current);
    }
  }, [axisConfig, mainPolygon]);

  // Render Interactive Rotatable Cut-Angle Handle on Map
  useEffect(() => {
    const group = cutAngleLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!isAdjustingCutAngle || !mainPolygon) return;

    try {
      const center = turf.centerOfMass(mainPolygon);
      const bbox = turf.bbox(mainPolygon);
      const diagKm = Math.max(
        0.03,
        turf.distance(turf.point([bbox[0], bbox[1]]), turf.point([bbox[2], bbox[3]]), { units: 'kilometers' })
      );
      const armKm = diagKm * 0.65;

      const bearingA = ((cutAngle % 360) + 360) % 360;
      const bearingB = (bearingA + 180) % 360;

      const endA = turf.destination(center, armKm, bearingA, { units: 'kilometers' });
      const endB = turf.destination(center, armKm, bearingB, { units: 'kilometers' });

      const axisLine = L.polyline(
        [
          [endA.geometry.coordinates[1], endA.geometry.coordinates[0]],
          [endB.geometry.coordinates[1], endB.geometry.coordinates[0]]
        ],
        {
          pane: 'drawMeasurementPane',
          color: '#f59e0b',
          weight: 3.5,
          dashArray: '8, 6'
        }
      ).addTo(group);

      // Center pivot dot
      L.circleMarker([center.geometry.coordinates[1], center.geometry.coordinates[0]], {
        pane: 'drawMeasurementPane',
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 1
      }).addTo(group);

      const createAngleHandle = (ptCoords: [number, number]) => {
        const handleIcon = L.divIcon({
          className: 'cut-angle-handle-wrapper',
          html: `<div style="width:26px;height:26px;border-radius:9999px;background:#f59e0b;border:2.5px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#0f172a;font-size:12px;font-weight:900;cursor:grab;">↻</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const marker = L.marker([ptCoords[1], ptCoords[0]], {
          pane: 'drawMeasurementPane',
          draggable: true,
          icon: handleIcon
        }).addTo(group);

        marker.bindTooltip(`Kesim Açısı: ${cutAngle.toFixed(1)}° (Sürükle)`, {
          direction: 'top',
          offset: [0, -14],
          className: 'bg-amber-500 text-slate-950 font-bold text-[11px] px-2 py-0.5 rounded shadow'
        });

        marker.on('drag', (ev: any) => {
          const ll = ev.latlng || marker.getLatLng();
          const draggedPt = turf.point([ll.lng, ll.lat]);
          const b = turf.bearing(center, draggedPt);
          const normDeg = Math.round(((((b % 180) + 180) % 180)) * 10) / 10;

          const newEndA = turf.destination(center, armKm, normDeg, { units: 'kilometers' });
          const newEndB = turf.destination(center, armKm, (normDeg + 180) % 360, { units: 'kilometers' });
          axisLine.setLatLngs([
            [newEndA.geometry.coordinates[1], newEndA.geometry.coordinates[0]],
            [newEndB.geometry.coordinates[1], newEndB.geometry.coordinates[0]]
          ]);
          marker.setTooltipContent(`Kesim Açısı: ${normDeg.toFixed(1)}°`);
        });

        marker.on('dragend', () => {
          const ll = marker.getLatLng();
          const draggedPt = turf.point([ll.lng, ll.lat]);
          const b = turf.bearing(center, draggedPt);
          const normDeg = Math.round(((((b % 180) + 180) % 180)) * 10) / 10;
          if (onChangeCutAngle) {
            onChangeCutAngle(normDeg);
          }
        });
      };

      createAngleHandle(endA.geometry.coordinates as [number, number]);
      createAngleHandle(endB.geometry.coordinates as [number, number]);
    } catch (err) {
      console.warn('Cut angle handle error:', err);
    }
  }, [isAdjustingCutAngle, mainPolygon, cutAngle, onChangeCutAngle]);

  // Render Parcels, Vertex Editing, Drag Merge, and Labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !piecesLayerGroupRef.current || !edgeLabelsGroupRef.current) return;

    piecesLayerGroupRef.current.clearLayers();
    edgeLabelsGroupRef.current.clearLayers();

    parcels.forEach((p, idx) => {
      const isSelected = selectedParcelIds.includes(p.id);

      let fillColor = idx % 2 === 0 ? '#0284c7' : '#f59e0b';
      let strokeColor = '#0284c7';

      if (isSelected) {
        fillColor = '#a855f7';
        strokeColor = '#7e22ce';
      }

      if (mapSettings.cadModeActive) {
        strokeColor = isSelected ? '#10b981' : '#38bdf8';
      }

      const geoJsonLayer = L.geoJSON(p.feature, {
        pane: 'ifrazPane',
        style: {
          color: strokeColor,
          weight: isSelected || mapSettings.cadModeActive ? 3.5 : 2,
          fillColor: fillColor,
          fillOpacity: mapSettings.showFill ? (isSelected ? 0.75 : ((mapSettings.parcelFillOpacity !== undefined ? mapSettings.parcelFillOpacity / 100 : 0.45))) : 0,
          dashArray: mapSettings.cadModeActive ? '4, 2' : undefined
        }
      }).addTo(piecesLayerGroupRef.current);

      // Tooltip content (Yol/Bitiş ve Min İmar Uyarıları kaldırıldı)
      const labelParts: string[] = [];
      if (mapSettings.showNames) labelParts.push(`<b>${p.name}</b>`);
      if (mapSettings.showAreas) labelParts.push(`${(p.areaM2 || 0).toFixed(1)} m²`);
      if (p.topography && (mapSettings.showSlopeInfo ?? true)) {
        labelParts.push(
          `<span style="font-size: 9.5px; color: #6ee7b7; font-weight: 600;">Eğim: %${p.topography.avgSlopePercent} (${p.topography.aspect}) | ΔZ: ${p.topography.elevationDiffM}m</span>`
        );
      }
      if (p.soilClassification && (mapSettings.showSoilInfo ?? true)) {
        labelParts.push(
          `<span style="font-size: 9px; color: #fcd34d; font-weight: 600;">🏗️ Zemin: ${p.soilClassification.soilClass} (qa: ${p.soilClassification.bearingCapacityKgCm2} kg)</span>`
        );
      }

      if (labelParts.length > 0) {
        geoJsonLayer.bindTooltip(labelParts.join('<br/>'), {
          permanent: true,
          direction: 'center',
          className: `area-tooltip ${isSelected ? 'selected' : ''}`,
          pane: 'labelPane'
        });
      }

      // Click: Sil, Obje Sor veya Parsel Seç
      geoJsonLayer.on('click', (e) => {
        if (isPickingTkgmRef.current) return;
        L.DomEvent.stopPropagation(e);
        if (activeDrawToolRef.current === 'delete') {
          onDeleteGeneratedParcelRef.current?.(p.id);
          return;
        }
        if (isObjectQueryRef.current) {
          const verts = getParcelVertices(p.feature);
          const edgeLengthsM = verts.map((v) => v.lengthToNextM);
          const perimeterM = edgeLengthsM.reduce((a, b) => a + b, 0);
          const cInfo = cadastralInfoRef.current;
          setInspectedObject({
            kind: 'generated-parcel',
            id: p.id,
            title: p.name,
            subtitle: 'İfraz Parseli',
            areaM2: p.areaM2,
            perimeterM,
            vertexCount: verts.length,
            edgeLengthsM,
            il: cInfo?.il,
            ilce: cInfo?.ilce,
            mahalle: cInfo?.mahalle,
            adaNo: cInfo?.adaNo,
            parselNo: cInfo?.parselNo,
            soilClass: p.soilClassification?.soilClass,
            vs30: p.soilClassification?.vs30,
            bearingCapacity: p.soilClassification?.bearingCapacityKgCm2,
            avgSlopePercent: p.topography?.avgSlopePercent,
            aspect: p.topography?.aspect,
            elevationDiffM: p.topography?.elevationDiffM,
            latlng: [e.latlng.lat, e.latlng.lng]
          });
          return;
        }
        onParcelSelectToggle(p.id);
      });

      if (!mapSettings.cadModeActive && mapSettings.enableDragMerge) {
        // Normal Drag-and-Drop Tevhid Mode
        geoJsonLayer.eachLayer((subLayer: any) => {
          if (subLayer.pm) {
            subLayer.pm.enableLayerDrag();

            subLayer.on('pm:dragend', () => {
              const droppedGeo = subLayer.toGeoJSON();
              let targetIdx = -1;

              for (let j = 0; j < parcels.length; j++) {
                if (j === idx) continue;
                const targetParcel = parcels[j];

                try {
                  const bufferedDropped = turf.buffer(droppedGeo, 0.002, { units: 'kilometers' }) || droppedGeo;
                  if (turf.booleanIntersects(bufferedDropped, targetParcel.feature)) {
                    targetIdx = j;
                    break;
                  }
                } catch (err) {
                  console.warn('Tevhid sürükleme kesişim kontrolü hatası:', err);
                }
              }

              if (targetIdx !== -1) {
                const targetParcel = parcels[targetIdx];
                const unionGeom = computeUnionGeometry(p.feature, targetParcel.feature);
                const approxArea = Math.round(turf.area(unionGeom || p.feature));
                const title = `Parsel #${idx + 1} + #${targetIdx + 1}: ${approxArea.toLocaleString('tr-TR')} m²`;

                try {
                  subLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                } catch {}

                playMergeMorphAnimation(p.feature, targetParcel.feature, unionGeom, title, droppedGeo, () => {
                  onDragMerge(idx, targetIdx);
                });
              } else {
                try {
                  const tempGroup = L.geoJSON(p.feature);
                  const originalSub = tempGroup.getLayers()[0] as L.Polygon;
                  if (originalSub && originalSub.getLatLngs) {
                    subLayer.setLatLngs(originalSub.getLatLngs());
                  }
                } catch (resetErr) {
                  console.warn('Reset position error:', resetErr);
                }
              }
            });
          }
        });
      } else {
        // Disable editing/dragging when no tool is active
        geoJsonLayer.eachLayer((subLayer: any) => {
          if (subLayer.pm) {
            subLayer.pm.disable();
            subLayer.pm.disableLayerDrag();
          }
        });
      }

      // Render Parallel Edge Lengths (Cephe Ölçüleri Çizgilere Paralel)
      if (mapSettings.showEdgeLengths) {
        let coords: [number, number][] = [];
        if (p.feature.geometry.type === 'Polygon') {
          coords = p.feature.geometry.coordinates[0] as [number, number][];
        } else if (p.feature.geometry.type === 'MultiPolygon') {
          coords = p.feature.geometry.coordinates[0][0] as [number, number][];
        }

        if (coords && coords.length > 2) {
          for (let i = 0; i < coords.length - 1; i++) {
            const p1 = turf.point(coords[i]);
            const p2 = turf.point(coords[i + 1]);
            const dist = turf.distance(p1, p2, { units: 'meters' });
            if (!Number.isFinite(dist) || dist < 0.4) continue; // Skip micro-vertices
            const mid = turf.midpoint(p1, p2);

            // Parallel angle calculation
            const bearing = turf.rhumbBearing(p1, p2);
            let angleDeg = bearing - 90;
            // CAD standard readability: keep text readable left-to-right (no upside down text)
            if (!Number.isFinite(angleDeg)) {
              angleDeg = 0;
            } else {
              angleDeg = ((((angleDeg + 90) % 180) + 180) % 180) - 90;
            }

            // Check if this edge is adjacent to a road boundary line
            let isRoadFrontageEdge = false;
            if (roadLines && roadLines.length > 0) {
              for (const rl of roadLines) {
                try {
                  const d = turf.pointToLineDistance(mid, rl as any, { units: 'meters' });
                  if (d <= 20) {
                    isRoadFrontageEdge = true;
                    break;
                  }
                } catch (e) {}
              }
            }

            const edgeScale = (mapSettings.edgeLabelScale ?? 100) / 100;
            const labelMarker = L.marker([mid.geometry.coordinates[1], mid.geometry.coordinates[0]], {
              pane: 'labelPane',
              interactive: false,
              icon: L.divIcon({
                className: 'edge-tooltip-wrapper',
                html: `<div class="edge-tooltip parallel ${isRoadFrontageEdge ? 'road-frontage' : ''}" style="transform: rotate(${angleDeg.toFixed(1)}deg) scale(${edgeScale.toFixed(2)}); transform-origin: center center;">${dist.toFixed(1)}m${isRoadFrontageEdge ? ' 🛣️' : ''}</div>`,
                iconSize: [64, 20],
                iconAnchor: [32, 10]
              })
            });

            edgeLabelsGroupRef.current.addLayer(labelMarker);
          }
        }
      }
    });

    // Also show parallel edge lengths on mainPolygon when unsubdivided
    if (parcels.length === 0 && mainPolygon && mapSettings.showEdgeLengths) {
      let mainCoords: [number, number][] = [];
      if (mainPolygon.geometry.type === 'Polygon') {
        mainCoords = mainPolygon.geometry.coordinates[0] as [number, number][];
      } else if (mainPolygon.geometry.type === 'MultiPolygon') {
        mainCoords = mainPolygon.geometry.coordinates[0]?.[0] as [number, number][];
      }

      const edgeScale = (mapSettings.edgeLabelScale ?? 100) / 100;
      if (mainCoords && mainCoords.length > 2) {
        for (let i = 0; i < mainCoords.length - 1; i++) {
          const p1 = turf.point(mainCoords[i]);
          const p2 = turf.point(mainCoords[i + 1]);
          const dist = turf.distance(p1, p2, { units: 'meters' });
          if (!Number.isFinite(dist) || dist < 0.4) continue;
          const mid = turf.midpoint(p1, p2);
          const bearing = turf.rhumbBearing(p1, p2);
          let angleDeg = bearing - 90;
          if (!Number.isFinite(angleDeg)) {
            angleDeg = 0;
          } else {
            angleDeg = ((((angleDeg + 90) % 180) + 180) % 180) - 90;
          }

          const labelMarker = L.marker([mid.geometry.coordinates[1], mid.geometry.coordinates[0]], {
            pane: 'labelPane',
            interactive: false,
            icon: L.divIcon({
              className: 'edge-tooltip-wrapper',
              html: `<div class="edge-tooltip parallel" style="transform: rotate(${angleDeg.toFixed(1)}deg) scale(${edgeScale.toFixed(2)}); transform-origin: center center;">${dist.toFixed(1)}m</div>`,
              iconSize: [64, 20],
              iconAnchor: [32, 10]
            })
          });
          edgeLabelsGroupRef.current.addLayer(labelMarker);
        }
      }
    }
  }, [
    mainPolygon,
    parcels,
    roadLines,
    mapSettings,
    selectedParcelIds,
    onParcelSelectToggle,
    onDragMerge,
    onParcelGeometryUpdated,
    playMergeMorphAnimation
  ]);

  // Render Balastro & İfraz/Tevhid Corner & Break Daire Noktaları (Circle Markers)
  useEffect(() => {
    if (!vertexMarkersGroupRef.current) return;
    vertexMarkersGroupRef.current.clearLayers();

    const isBalastroActive = mapSettings.showCadastre ?? true;
    const isVertexEditing = mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex';
    if (!isBalastroActive || isVertexEditing) return;

    interface RawNode {
      lng: number;
      lat: number;
      isCadastral: boolean;
      isIfrazCut: boolean;
      parcelName?: string;
    }

    interface UniqueVertexNode {
      lng: number;
      lat: number;
      isCadastral: boolean;
      isIfrazCut: boolean;
      parcelNames: string[];
    }

    const rawNodes: RawNode[] = [];

    // 1. Balastro Ana Kadastro Sınır Köşeleri
    if (mainPolygon) {
      let mainCoords: [number, number][] = [];
      if (mainPolygon.geometry.type === 'Polygon') {
        mainCoords = (mainPolygon.geometry.coordinates[0] || []).slice(0, -1) as [number, number][];
      } else if (mainPolygon.geometry.type === 'MultiPolygon') {
        mainCoords = mainPolygon.geometry.coordinates.flatMap((poly) => (poly[0] || []).slice(0, -1)) as [number, number][];
      }

      mainCoords.forEach(([lng, lat]) => {
        rawNodes.push({
          lng,
          lat,
          isCadastral: true,
          isIfrazCut: false,
          parcelName: 'Ana Kadastro Sınırı'
        });
      });
    }

    // 2. İkincil Kadastro Parselleri Köşeleri
    if (secondaryParcels && secondaryParcels.length > 0) {
      secondaryParcels.forEach((sp) => {
        let spCoords: [number, number][] = [];
        if (sp.geometry.geometry.type === 'Polygon') {
          spCoords = (sp.geometry.geometry.coordinates[0] || []).slice(0, -1) as [number, number][];
        } else if (sp.geometry.geometry.type === 'MultiPolygon') {
          spCoords = sp.geometry.geometry.coordinates.flatMap((poly) => (poly[0] || []).slice(0, -1)) as [number, number][];
        }
        spCoords.forEach(([lng, lat]) => {
          rawNodes.push({
            lng,
            lat,
            isCadastral: true,
            isIfrazCut: false,
            parcelName: `${sp.cadastralInfo.adaNo}/${sp.cadastralInfo.parselNo}`
          });
        });
      });
    }

    // 3. İfraz ve Tevhid Sonrası Oluşan Parça Kırıkları
    if (parcels && parcels.length > 0) {
      parcels.forEach((p) => {
        let pCoords: [number, number][] = [];
        if (p.feature.geometry.type === 'Polygon') {
          pCoords = (p.feature.geometry.coordinates[0] || []).slice(0, -1) as [number, number][];
        } else if (p.feature.geometry.type === 'MultiPolygon') {
          pCoords = p.feature.geometry.coordinates.flatMap((poly) => (poly[0] || []).slice(0, -1)) as [number, number][];
        }

        pCoords.forEach(([lng, lat]) => {
          rawNodes.push({
            lng,
            lat,
            isCadastral: false,
            isIfrazCut: true,
            parcelName: p.name
          });
        });
      });
    }

    if (rawNodes.length === 0) return;

    // Deduplicate nearby nodes within ~0.3 meters (~0.000003 deg)
    const uniqueNodes: UniqueVertexNode[] = [];

    for (const item of rawNodes) {
      let matched = false;
      for (const existing of uniqueNodes) {
        const dLng = item.lng - existing.lng;
        const dLat = item.lat - existing.lat;
        const distDeg = Math.sqrt(dLng * dLng + dLat * dLat);
        if (distDeg < 0.000004) {
          matched = true;
          if (item.isCadastral) existing.isCadastral = true;
          if (item.isIfrazCut) existing.isIfrazCut = true;
          if (item.parcelName && !existing.parcelNames.includes(item.parcelName)) {
            existing.parcelNames.push(item.parcelName);
          }
          break;
        }
      }

      if (!matched) {
        uniqueNodes.push({
          lng: item.lng,
          lat: item.lat,
          isCadastral: item.isCadastral,
          isIfrazCut: item.isIfrazCut,
          parcelNames: item.parcelName ? [item.parcelName] : []
        });
      }
    }

    // Render Circle Markers (Daire Noktaları) on vertexPane
    uniqueNodes.forEach((node, idx) => {
      const isIntersection = node.isCadastral && node.isIfrazCut;
      const isIfrazInternal = !node.isCadastral && node.isIfrazCut;

      const pointIndex = idx + 1;
      let pointTypeLabel = 'Balastro Köşesi';
      let fillColor = '#06b6d4'; // Cyan
      let outlineColor = '#083344';
      let radius = 6;
      let badgeClass = 'cadastral';

      if (isIntersection) {
        pointTypeLabel = 'İfraz & Sınır Kırığı';
        fillColor = '#38bdf8'; // Sky blue
        outlineColor = '#0c4a6e';
        radius = 6;
        badgeClass = 'cadastral';
      } else if (isIfrazInternal) {
        pointTypeLabel = 'İfraz/Tevhit Kırık Noktası';
        fillColor = '#f59e0b'; // Amber
        outlineColor = '#451a03';
        radius = 5.5;
        badgeClass = 'ifraz';
      }

      const circle = L.circleMarker([node.lat, node.lng], {
        pane: 'vertexPane',
        radius,
        fillColor,
        color: outlineColor,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(vertexMarkersGroupRef.current!);

      // Hover expand effect
      circle.on('mouseover', () => {
        circle.setRadius(radius + 2);
        circle.setStyle({ weight: 3 });
      });
      circle.on('mouseout', () => {
        circle.setRadius(radius);
        circle.setStyle({ weight: 2 });
      });

      // Interactive Click Popup with full CAD Coordinates
      const popupContent = `
        <div class="px-2.5 py-1.5 font-mono text-center text-slate-100 select-text">
          <div class="flex items-center justify-center gap-1.5 font-bold text-xs ${
            isIfrazInternal ? 'text-amber-400' : 'text-cyan-400'
          }">
            <span>●</span>
            <span>Nokta #${pointIndex}</span>
            <span class="text-[10px] font-normal text-slate-300">(${pointTypeLabel})</span>
          </div>
          <div class="text-[11px] text-slate-200 mt-1.5 flex justify-between gap-3 border-t border-white/10 pt-1">
            <span class="text-slate-400">Y (Enlem):</span>
            <span class="font-bold font-mono text-emerald-400">${node.lat.toFixed(6)}</span>
          </div>
          <div class="text-[11px] text-slate-200 flex justify-between gap-3">
            <span class="text-slate-400">X (Boylam):</span>
            <span class="font-bold font-mono text-emerald-400">${node.lng.toFixed(6)}</span>
          </div>
          ${
            node.parcelNames.length > 0
              ? `<div class="text-[9.5px] text-slate-300 mt-1 pt-1 border-t border-white/10 truncate max-w-[200px]">
                   Ait Parseller: <b>${node.parcelNames.join(', ')}</b>
                 </div>`
              : ''
          }
        </div>
      `;

      circle.bindPopup(popupContent, {
        className: 'apple-glass-popup'
      });

      // Small permanent numbering badge next to the point
      circle.bindTooltip(String(pointIndex), {
        permanent: true,
        direction: 'right',
        offset: [8, 0],
        className: `vertex-point-badge ${badgeClass}`
      });
    });
  }, [mainPolygon, parcels, secondaryParcels, mapSettings.showCadastre, mapSettings.cadModeActive, mapSettings.cadActiveTool]);

  // CAD Dynamic-Line Vertex Editing Engine (Handles corner dragging along dynamic rails, midpoint insertion, and right-click delete)
  useEffect(() => {
    const map = mapRef.current;
    const vertexGroup = cadVertexLayerGroupRef.current;
    const guideGroup = cadGuideLayerGroupRef.current;
    if (!map || !vertexGroup || !guideGroup) return;

    vertexGroup.clearLayers();
    guideGroup.clearLayers();
    setVertexDragHud(null);

    const isVertexMode = mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex';
    if (!isVertexMode) return;

    // Select editable target polygons
    const editableTargets: Array<{ id: string; name: string; feature: ParcelGeometry }> = [];
    if (parcels.length > 0) {
      const subset =
        selectedParcelIds.length > 0
          ? parcels.filter((p) => selectedParcelIds.includes(p.id))
          : parcels;
      subset.forEach((p) => {
        editableTargets.push({ id: p.id, name: p.name, feature: p.feature });
      });
    } else if (mainPolygon) {
      editableTargets.push({ id: 'main-parcel', name: 'Ana Parsel', feature: mainPolygon });
    }

    if (editableTargets.length === 0) return;

    // Collect boundary segments (mainPolygon, all parcels, secondaryParcels, roadLines) for dynamic boundary rail
    const boundarySources: Array<{ id: string; label: string; feature: ParcelGeometry }> = [];
    if (mainPolygon && parcels.length > 0) {
      boundarySources.push({ id: 'main-parcel-border', label: 'Ana Parsel', feature: mainPolygon });
    }
    parcels.forEach((p) => boundarySources.push({ id: p.id, label: p.name, feature: p.feature }));
    secondaryParcels.forEach((sp) =>
      boundarySources.push({
        id: sp.id,
        label: `${sp.cadastralInfo.adaNo}/${sp.cadastralInfo.parselNo}`,
        feature: sp.geometry
      })
    );

    const boundarySegments = extractBoundarySegments(boundarySources);
    roadLines.forEach((rl, rIdx) => {
      const coords = rl.geometry?.coordinates || [];
      for (let i = 0; i < coords.length - 1; i++) {
        boundarySegments.push({
          a: [coords[i][0], coords[i][1]],
          b: [coords[i + 1][0], coords[i + 1][1]],
          sourceId: `road-${rIdx}`,
          label: `İmar Yolu ${rIdx + 1}`
        });
      }
    });

    // Collect all existing vertices for point-snapping
    const allCorners: [number, number][] = [];
    boundarySources.forEach((src) => {
      allCorners.push(...extractEditableVertices(src.feature));
    });
    if (mainPolygon && parcels.length === 0) {
      allCorners.push(...extractEditableVertices(mainPolygon));
    }

    const commitPolygonUpdate = (
      targetId: string,
      updatedFeature: ParcelGeometry,
      origVert?: [number, number],
      finalVert?: [number, number]
    ) => {
      skipFitBoundsRef.current = true;
      if (targetId === 'main-parcel') {
        if (onMainPolygonUpdated) {
          onMainPolygonUpdated(updatedFeature);
        }
        return;
      }

      // Check for shared vertices across other parcels if syncSharedVertices is active
      if (
        origVert &&
        finalVert &&
        syncSharedVerticesRef.current &&
        parcels.length > 1 &&
        onBatchParcelGeometryUpdated
      ) {
        const updates: Array<{ parcelId: string; updatedFeature: ParcelGeometry }> = [
          { parcelId: targetId, updatedFeature }
        ];

        parcels.forEach((other) => {
          if (other.id === targetId) return;
          const otherVerts = extractEditableVertices(other.feature);
          let changed = false;
          const nextOtherVerts = otherVerts.map((ov) => {
            const dM = turf.distance(turf.point(ov), turf.point(origVert), { units: 'meters' });
            if (dM <= 0.25) {
              changed = true;
              return finalVert;
            }
            return ov;
          });
          if (changed) {
            const nextOtherFeature = buildUpdatedParcelGeometry(other.feature, nextOtherVerts);
            if (!hasSelfIntersection(nextOtherFeature)) {
              updates.push({ parcelId: other.id, updatedFeature: nextOtherFeature });
            }
          }
        });

        onBatchParcelGeometryUpdated(updates);
        return;
      }

      if (onParcelGeometryUpdated) {
        onParcelGeometryUpdated(targetId, updatedFeature);
      }
    };

    const startDynamicVertexDrag = (params: {
      marker: L.Marker;
      target: { id: string; name: string; feature: ParcelGeometry };
      verts: [number, number][];
      vIdx: number;
      originVert: [number, number];
      prevVert: [number, number];
      nextVert: [number, number];
      isNewVertex: boolean;
    }) => {
      const { marker, target, verts, vIdx, originVert, prevVert, nextVert, isNewVertex } = params;
      const origAreaM2 = turf.area(target.feature);
      const bbox = turf.bbox(target.feature);
      const bboxDiagM = Math.max(
        40,
        turf.distance(turf.point([bbox[0], bbox[1]]), turf.point([bbox[2], bbox[3]]), {
          units: 'meters'
        })
      );

      let guideLines: DynamicGuideLine[] = [];
      let snapTargets: [number, number][] = [];
      let rubberPolygon: L.Polygon | null = null;
      let activeRailLine: L.Polyline | null = null;
      let prevEdgeLabel: L.Marker | null = null;
      let nextEdgeLabel: L.Marker | null = null;
      let lastSnappedLngLat: [number, number] = originVert;

      const makeEdgeLabelIcon = (text: string) =>
        L.divIcon({
          className: 'draw-edge-measure-wrapper',
          html: `<div class="draw-edge-measure-tooltip" style="border-color:#22d3ee;background:rgba(15,23,42,0.92);color:#e0f2fe;">${text}</div>`,
          iconSize: [0, 0]
        });

      const buildLiveVerts = (pt: [number, number]): [number, number][] => {
        if (isNewVertex) {
          const copy = [...verts];
          copy.splice(vIdx, 0, pt);
          return copy;
        }
        return verts.map((v, i) => (i === vIdx ? pt : v));
      };

      marker.on('dragstart', () => {
        guideGroup.clearLayers();
        const mode = dynamicLineModeRef.current;

        guideLines = buildDynamicGuideLines({
          originVert,
          prevVert,
          nextVert,
          cutAngleDeg: cutAngle || 0,
          extentM: Math.max(120, bboxDiagM * 1.8),
          boundarySegments,
          editingParcelId: target.id
        });

        snapTargets = allCorners.filter(
          (c) => turf.distance(turf.point(c), turf.point(originVert), { units: 'meters' }) > 0.25
        );

        // Render subtle dashed candidate dynamic guide rails
        guideLines.forEach((gl) => {
          if (gl.category === 'cardinal') return;
          if (mode === 'edge' && gl.category !== 'edge' && gl.category !== 'ortho') return;
          if (mode === 'cut' && gl.category !== 'cut') return;
          if (mode === 'boundary' && gl.category !== 'boundary') return;
          if (mode === 'free') return;

          L.polyline(
            [
              [gl.p1[1], gl.p1[0]],
              [gl.p2[1], gl.p2[0]]
            ],
            {
              pane: 'cadGuidePane',
              color: gl.color,
              weight: 1.5,
              opacity: 0.42,
              dashArray: '5, 5',
              interactive: false
            }
          ).addTo(guideGroup);
        });

        // Origin anchor ring
        L.circleMarker([originVert[1], originVert[0]], {
          pane: 'cadGuidePane',
          radius: 4,
          color: '#94a3b8',
          weight: 1.5,
          fillColor: '#0f172a',
          fillOpacity: 0.8,
          interactive: false
        }).addTo(guideGroup);

        // Active snapped dynamic rail highlight (initially hidden)
        activeRailLine = L.polyline([], {
          pane: 'cadGuidePane',
          color: '#22d3ee',
          weight: 3,
          opacity: 0.95,
          dashArray: '8, 4',
          interactive: false
        }).addTo(guideGroup);

        // Live rubber-band polygon outline
        const initRing = buildLiveVerts(originVert).map((c): [number, number] => [c[1], c[0]]);
        rubberPolygon = L.polygon(initRing, {
          pane: 'cadGuidePane',
          color: '#34d399',
          weight: 2.5,
          fillColor: '#10b981',
          fillOpacity: 0.16,
          dashArray: '4, 3',
          interactive: false
        }).addTo(guideGroup);

        prevEdgeLabel = L.marker(
          [(prevVert[1] + originVert[1]) / 2, (prevVert[0] + originVert[0]) / 2],
          {
            pane: 'drawMeasurementPane',
            interactive: false,
            icon: makeEdgeLabelIcon('0.00 m')
          }
        ).addTo(guideGroup);

        nextEdgeLabel = L.marker(
          [(nextVert[1] + originVert[1]) / 2, (nextVert[0] + originVert[0]) / 2],
          {
            pane: 'drawMeasurementPane',
            interactive: false,
            icon: makeEdgeLabelIcon('0.00 m')
          }
        ).addTo(guideGroup);
      });

      marker.on('drag', (ev: any) => {
        const raw = ev.latlng || marker.getLatLng();
        const mode = dynamicLineModeRef.current;
        const tolM = getMeterToleranceForPixels(map, originVert, 18);

        const snap = snapVertexToDynamicLines({
          cursorLngLat: [raw.lng, raw.lat],
          originVert,
          guideLines,
          mode,
          snapToleranceM: tolM,
          snapTargets
        });

        lastSnappedLngLat = snap.lngLat;
        marker.setLatLng([snap.lngLat[1], snap.lngLat[0]]);

        if (activeRailLine) {
          if (snap.activeLine) {
            activeRailLine.setLatLngs([
              [snap.activeLine.p1[1], snap.activeLine.p1[0]],
              [snap.activeLine.p2[1], snap.activeLine.p2[0]]
            ]);
            activeRailLine.setStyle({ color: snap.activeLine.color, opacity: 0.95 });
          } else {
            activeRailLine.setLatLngs([]);
          }
        }

        const liveVerts = buildLiveVerts(snap.lngLat);
        if (rubberPolygon) {
          rubberPolygon.setLatLngs(liveVerts.map((c): [number, number] => [c[1], c[0]]));
        }

        const prevEdgeM = turf.distance(turf.point(prevVert), turf.point(snap.lngLat), {
          units: 'meters'
        });
        const nextEdgeM = turf.distance(turf.point(snap.lngLat), turf.point(nextVert), {
          units: 'meters'
        });

        if (prevEdgeLabel) {
          prevEdgeLabel.setLatLng([(prevVert[1] + snap.lngLat[1]) / 2, (prevVert[0] + snap.lngLat[0]) / 2]);
          prevEdgeLabel.setIcon(makeEdgeLabelIcon(`${prevEdgeM.toFixed(2)} m`));
        }
        if (nextEdgeLabel) {
          nextEdgeLabel.setLatLng([(nextVert[1] + snap.lngLat[1]) / 2, (nextVert[0] + snap.lngLat[0]) / 2]);
          nextEdgeLabel.setIcon(makeEdgeLabelIcon(`${nextEdgeM.toFixed(2)} m`));
        }

        let liveArea = origAreaM2;
        try {
          liveArea = turf.area(buildUpdatedParcelGeometry(target.feature, liveVerts));
        } catch {}

        setVertexDragHud({
          parcelName: target.name,
          vertexIndex: vIdx + 1,
          isNewVertex,
          activeLineLabel: snap.activeLine
            ? snap.activeLine.label
            : snap.snappedToVertex
            ? 'Köşe Noktasına Kenetlendi'
            : null,
          activeLineColor: snap.activeLine ? snap.activeLine.color : snap.snappedToVertex ? '#34d399' : '#94a3b8',
          activeLineBearingDeg: snap.activeLine ? snap.activeLine.bearingDeg : null,
          snappedToVertex: snap.snappedToVertex,
          prevEdgeM,
          nextEdgeM,
          areaM2: liveArea,
          areaDeltaM2: liveArea - origAreaM2,
          displacementM: snap.displacementM,
          lngLat: snap.lngLat
        });
      });

      marker.on('dragend', () => {
        guideGroup.clearLayers();
        setVertexDragHud(null);

        const finalPt = lastSnappedLngLat;
        const movedM = turf.distance(turf.point(originVert), turf.point(finalPt), {
          units: 'meters'
        });

        if (movedM < 0.02 && !isNewVertex) {
          marker.setLatLng([originVert[1], originVert[0]]);
          return;
        }

        const updatedVerts = buildLiveVerts(finalPt);
        const updatedFeature = buildUpdatedParcelGeometry(target.feature, updatedVerts);

        if (hasSelfIntersection(updatedFeature)) {
          marker.setLatLng([originVert[1], originVert[0]]);
          return;
        }

        commitPolygonUpdate(target.id, updatedFeature, isNewVertex ? undefined : originVert, finalPt);
      });
    };

    // Render draggable corners and edge midpoint '+' handles for each editable polygon
    editableTargets.forEach((target) => {
      const verts = extractEditableVertices(target.feature);
      if (verts.length < 3) return;

      verts.forEach((vert, vIdx) => {
        const prevVert = verts[(vIdx - 1 + verts.length) % verts.length];
        const nextVert = verts[(vIdx + 1) % verts.length];

        const cornerIcon = L.divIcon({
          className: 'cad-vertex-handle-wrapper',
          html: `<div style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;cursor:grab;"><div style="width:12px;height:12px;border-radius:9999px;background:#10b981;border:2.5px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.65);transition:transform 0.12s;"></div></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const cornerMarker = L.marker([vert[1], vert[0]], {
          pane: 'cadVertexPane',
          draggable: true,
          icon: cornerIcon
        }).addTo(vertexGroup);

        cornerMarker.bindTooltip(
          `P${vIdx + 1} (${target.name}) · Dinamik Hatla Sürükle${verts.length > 3 ? ' · Sağ Tık: Sil' : ''}`,
          {
            direction: 'top',
            offset: [0, -10],
            className: 'bg-slate-950/95 text-emerald-300 font-semibold text-[10px] px-2 py-0.5 rounded border border-emerald-500/40 shadow'
          }
        );

        cornerMarker.on('contextmenu', (ev: any) => {
          L.DomEvent.preventDefault(ev);
          L.DomEvent.stopPropagation(ev);
          if (verts.length <= 3) return;
          const nextVerts = verts.filter((_, i) => i !== vIdx);
          const updatedFeature = buildUpdatedParcelGeometry(target.feature, nextVerts);
          if (!hasSelfIntersection(updatedFeature)) {
            commitPolygonUpdate(target.id, updatedFeature);
          }
        });

        startDynamicVertexDrag({
          marker: cornerMarker,
          target,
          verts,
          vIdx,
          originVert: vert,
          prevVert,
          nextVert,
          isNewVertex: false
        });

        // Edge midpoint '+' handle to insert a new break point and drag immediately
        const edgeLenM = turf.distance(turf.point(vert), turf.point(nextVert), { units: 'meters' });
        if (edgeLenM >= 1.5) {
          const midVert: [number, number] = [
            (vert[0] + nextVert[0]) / 2,
            (vert[1] + nextVert[1]) / 2
          ];
          const midIcon = L.divIcon({
            className: 'cad-midpoint-handle-wrapper',
            html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;cursor:crosshair;"><div style="width:10px;height:10px;border-radius:9999px;background:rgba(56,189,248,0.85);border:1.5px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#0f172a;font-size:9px;font-weight:900;line-height:1;">+</div></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });

          const midMarker = L.marker([midVert[1], midVert[0]], {
            pane: 'cadVertexPane',
            draggable: true,
            icon: midIcon
          }).addTo(vertexGroup);

          midMarker.bindTooltip(`Yeni Kırık Ekle (+ Tıkla veya Sürükle)`, {
            direction: 'top',
            offset: [0, -8],
            className: 'bg-slate-950/90 text-sky-300 text-[10px] px-1.5 py-0.5 rounded border border-sky-500/40 shadow'
          });

          midMarker.on('click', (ev: any) => {
            L.DomEvent.stopPropagation(ev);
            const nextVerts = [...verts];
            nextVerts.splice(vIdx + 1, 0, midVert);
            const updatedFeature = buildUpdatedParcelGeometry(target.feature, nextVerts);
            if (!hasSelfIntersection(updatedFeature)) {
              commitPolygonUpdate(target.id, updatedFeature);
            }
          });

          startDynamicVertexDrag({
            marker: midMarker,
            target,
            verts,
            vIdx: vIdx + 1,
            originVert: midVert,
            prevVert: vert,
            nextVert,
            isNewVertex: true
          });
        }
      });
    });

    return () => {
      vertexGroup.clearLayers();
      guideGroup.clearLayers();
      setVertexDragHud(null);
    };
  }, [
    mainPolygon,
    parcels,
    secondaryParcels,
    roadLines,
    selectedParcelIds,
    mapSettings.cadModeActive,
    mapSettings.cadActiveTool,
    cutAngle,
    onMainPolygonUpdated,
    onParcelGeometryUpdated,
    onBatchParcelGeometryUpdated
  ]);

  const handleToggleDrawPolygon = (forceEnable?: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const shouldEnable = forceEnable !== undefined ? forceEnable : activeDrawTool !== 'polygon';

    if (!shouldEnable) {
      map.pm.disableDraw();
      setActiveDrawTool(null);
      setDrawingLiveMetrics(null);
      if (drawMeasurementsGroupRef.current) {
        drawMeasurementsGroupRef.current.clearLayers();
      }
    } else {
      if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
      if (mapSettings.cadModeActive && onToggleCadMode) onToggleCadMode(false);
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
        tooltips: true,
        finishOn: 'dblclick'
      });
      setActiveDrawTool('polygon');
    }
  };

  const handleToggleDrawLine = (forceEnable?: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const shouldEnable = forceEnable !== undefined ? forceEnable : activeDrawTool !== 'line';
    if (!shouldEnable) {
      map.pm.disableDraw();
      setActiveDrawTool(null);
    } else {
      if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
      if (mapSettings.cadModeActive && onToggleCadMode) onToggleCadMode(false);
      map.pm.enableDraw('Line', {
        snappable: true,
        snapDistance: 20,
        tooltips: true
      });
      setActiveDrawTool('line');
    }
  };

  const handleToggleRemovalMode = (forceEnable?: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const shouldEnable = forceEnable !== undefined ? forceEnable : activeDrawTool !== 'delete';
    if (!shouldEnable) {
      if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
      setActiveDrawTool(null);
    } else {
      map.pm.disableDraw();
      if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
      if (mapSettings.cadModeActive && onToggleCadMode) onToggleCadMode(false);
      setActiveDrawTool('delete');
    }
  };

  const handleToggleCadVertex = () => {
    const map = mapRef.current;
    if (map) {
      map.pm.disableDraw();
      if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
    }
    setActiveDrawTool(null);
    const nextActive = !mapSettings.cadModeActive;
    if (onToggleCadMode) onToggleCadMode(nextActive);
    if (nextActive && onChangeCadTool) onChangeCadTool('vertex');
  };

  const handleToggleCadSlice = () => {
    const map = mapRef.current;
    if (map) {
      map.pm.disableDraw();
      if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
    }
    setActiveDrawTool(null);
    if (!mapSettings.cadModeActive) {
      if (onToggleCadMode) onToggleCadMode(true);
    }
    if (onChangeCadTool) {
      onChangeCadTool(mapSettings.cadActiveTool === 'slice' && mapSettings.cadModeActive ? 'vertex' : 'slice');
    }
  };

  return (
    <div className="relative w-full h-full">
      <div id="map-element" className="w-full h-full bg-slate-900" />

      {/* Floating Status Bar for Multi-Edge (Çoklu Kırık) Road Frontage Select */}
      {isSelectingFrontageEdge && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] h-10 px-4 bg-amber-500 text-slate-950 font-semibold rounded-full flex items-center gap-3 shadow-[0_12px_36px_rgba(245,158,11,0.4)] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs">
            <Compass className="w-4 h-4 stroke-[2.5] animate-pulse" />
            <span>
              Çoklu Kırık Cephe Seçimi:{' '}
              {selectedFrontageEdgeIndices.length > 0 ? (
                <strong className="font-extrabold underline">{selectedFrontageEdgeIndices.length} Kırık Kenar Seçildi</strong>
              ) : (
                'Parselin yol kenarlarına haritada tıklayın'
              )}
            </span>
          </div>
          {onDoneSelectingFrontage && (
            <button
              onClick={onDoneSelectingFrontage}
              className="h-6 px-2.5 bg-slate-950 text-amber-300 hover:bg-slate-900 active:scale-95 text-[11px] font-bold rounded-full flex items-center gap-1 transition ml-1 shadow-sm"
              title="Seçimi Tamamla"
            >
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Tamam</span>
            </button>
          )}
        </div>
      )}

      {/* Kapalı Durumda Sürüklenebilir Sağ Menüyü Açma Butonu */}
      {!isRightMenuOpen && (
        <div
          ref={cadPanelRef}
          onPointerDown={handleCadDragStart}
          style={{ left: `${cadPos.x}px`, top: `${cadPos.y}px` }}
          className="no-print fixed z-[1000] h-10 px-2.5 apple-glass rounded-full flex items-center gap-1.5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/15 hover:border-white/25 transition cursor-grab active:cursor-grabbing select-none touch-none"
          title="Sürükleyerek taşıyabilir veya tıklayarak CAD & Çizim menüsünü açabilirsiniz"
        >
          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <button
            type="button"
            onClick={() => setIsRightMenuOpen(true)}
            className="flex items-center gap-1.5 pr-1 hover:text-blue-300 transition active:scale-95"
            title="CAD & Çizim Araçları Menüsünü Aç"
          >
            <PenTool className="w-4 h-4 text-blue-400 stroke-[2]" />
            <span className="font-semibold text-xs">CAD & Çizim</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 rotate-180" />
          </button>
        </div>
      )}

      {/* Sürüklenebilir CAD & Çizim Araç Çubuğu */}
      {isRightMenuOpen && (
        <div
          ref={cadPanelRef}
          style={{ left: `${cadPos.x}px`, top: `${cadPos.y}px` }}
          className="no-print fixed z-[1000] flex flex-col p-2.5 apple-glass rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/15 text-white animate-in fade-in duration-150 w-56 select-none"
        >
          {/* Sürüklenebilir Header */}
          <div
            onPointerDown={handleCadDragStart}
            className="flex items-center justify-between px-1.5 py-1 border-b border-white/[0.08] mb-2 cursor-grab active:cursor-grabbing touch-none"
            title="Başlıktan tutup ekranda istediğiniz yere sürükleyin"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <PenTool className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
              <span>CAD & Çizim</span>
            </div>
            <div className="flex items-center gap-1">
              {(activeDrawTool || mapSettings.cadModeActive || mapSettings.enableDragMerge || isObjectQueryActive) && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <button
                type="button"
                onClick={() => setIsRightMenuOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                title="CAD & Çizim Menüsünü Gizle"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[82vh] overflow-y-auto pr-0.5">
            {/* Başlık 1: Çizim & Silme */}
            <div className="space-y-1">
              <div className="px-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Çizim & Silme
              </div>

              {/* Parsel / Poligon Çiz */}
              <button
                type="button"
                onClick={() => handleToggleDrawPolygon()}
                className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  activeDrawTool === 'polygon'
                    ? 'bg-blue-500 text-white font-bold shadow-md shadow-blue-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="Haritada yeni parsel veya poligon çizin (Tekrar tıklayarak kapatabilirsiniz)"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Shapes className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${activeDrawTool === 'polygon' ? 'text-white' : 'text-blue-400'}`} />
                  <span className="text-[11px] truncate">Parsel Çiz</span>
                </div>
                {activeDrawTool === 'polygon' && (
                  <span className="text-[9px] bg-blue-700 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                    KAPAT
                  </span>
                )}
              </button>

              {/* İmar Yolu / Çizgi Çiz */}
              <button
                type="button"
                onClick={() => handleToggleDrawLine()}
                className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  activeDrawTool === 'line'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="Harita üzerine imar yolu veya referans çizgisi çizin (Tekrar tıklayarak kapatabilirsiniz)"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Spline className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${activeDrawTool === 'line' ? 'text-slate-950' : 'text-amber-400'}`} />
                  <span className="text-[11px] truncate">Yol Çiz</span>
                </div>
                {activeDrawTool === 'line' && (
                  <span className="text-[9px] bg-amber-600 text-slate-950 px-1.5 py-0.5 rounded font-bold shrink-0">
                    KAPAT
                  </span>
                )}
              </button>

              {/* Sil (Parsel / Çizgi) */}
              <button
                type="button"
                onClick={() => handleToggleRemovalMode()}
                className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  activeDrawTool === 'delete'
                    ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30'
                    : 'text-slate-300 hover:text-rose-200 hover:bg-rose-500/15'
                }`}
                title="Silme modu: Silmek istediğiniz parsel veya yol çizgisine haritada tıklayın"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Trash2 className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${activeDrawTool === 'delete' ? 'text-white' : 'text-rose-400'}`} />
                  <span className="text-[11px] truncate">Sil</span>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                    activeDrawTool === 'delete' ? 'bg-rose-700 text-white' : 'text-rose-300/80 bg-rose-500/10'
                  }`}
                >
                  {activeDrawTool === 'delete' ? 'KAPAT' : 'SİL'}
                </span>
              </button>
            </div>

            <div className="h-px bg-white/[0.08] mx-1" />

            {/* Başlık 2: CAD Düzenleme */}
            <div className="space-y-1">
              <div className="px-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                CAD Düzenleme
              </div>

              {/* CAD Köşe Düzenle */}
              <button
                type="button"
                onClick={() => handleToggleCadVertex()}
                className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                    : mapSettings.cadModeActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="CAD Köşe Düzenleme Modu (Vertex Edit): Parsel köşelerini sürükleyerek şekillendirin"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Crosshair className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex' ? 'text-slate-950' : 'text-emerald-400'}`} />
                  <span className="text-[11px] truncate">CAD Düzenle</span>
                </div>
                {mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex' && (
                  <span className="text-[9px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                    KAPAT
                  </span>
                )}
              </button>

              {/* CAD Bıçağı */}
              <button
                type="button"
                onClick={() => handleToggleCadSlice()}
                className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice'
                    ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="CAD Bıçağı: Parselin üzerinden geçen serbest çizgi çizerek bölün"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Scissors className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice' ? 'text-white' : 'text-rose-400'}`} />
                  <span className="text-[11px] truncate">CAD Bıçağı</span>
                </div>
                {mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice' && (
                  <span className="text-[9px] bg-rose-700 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                    KAPAT
                  </span>
                )}
              </button>

              {/* Sürükle-Bırak Tevhit */}
              <button
                type="button"
                onClick={() => {
                  if (onToggleDragMerge) onToggleDragMerge();
                }}
                className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  mapSettings.enableDragMerge
                    ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30 border border-purple-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title={
                  mapSettings.enableDragMerge
                    ? 'Sürükle-Bırak Tevhit Aktif: Birleştirmek için parseli diğerinin üzerine sürükleyin'
                    : 'Sürükle-Bırak Tevhit Modunu Aç'
                }
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${mapSettings.enableDragMerge ? 'text-white' : 'text-purple-400'}`} />
                  <span className="text-[11px] truncate">Sürükle Tevhit</span>
                </div>
                {mapSettings.enableDragMerge && (
                  <span className="text-[9px] bg-purple-900/90 text-purple-200 px-1.5 py-0.5 rounded font-bold shrink-0">
                    KAPAT
                  </span>
                )}
              </button>

              {/* Köşe Koordinatları Tablosu */}
              <button
                type="button"
                onClick={() => setShowVertexTable((prev) => !prev)}
                className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  showVertexTable
                    ? 'bg-blue-500 text-white font-bold shadow-md shadow-blue-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                title="Seçili Parsel Köşe Koordinatları Tablosunu Göster/Gizle"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Table className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${showVertexTable ? 'text-white' : 'text-blue-400'}`} />
                  <span className="text-[11px] truncate">Koordinatlar</span>
                </div>
                {showVertexTable && (
                  <span className="text-[9px] bg-blue-700 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                    KAPAT
                  </span>
                )}
              </button>
            </div>

            <div className="h-px bg-white/[0.08] mx-1" />

            {/* Başlık 3: Sorgu & Analiz */}
            <div className="space-y-1">
              <div className="px-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Sorgu & Analiz
              </div>

              {/* Obje Sor */}
              {onToggleObjectQuery && (
                <button
                  type="button"
                  onClick={() => onToggleObjectQuery()}
                  className={`w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                    isObjectQueryActive
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                  title="Haritada parsel, yol veya koordinat tıklayarak obje bilgilerini sorgulayın"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Info className={`w-3.5 h-3.5 stroke-[2] shrink-0 ${isObjectQueryActive ? 'text-slate-950' : 'text-cyan-400'}`} />
                    <span className="text-[11px] truncate">Obje Sor</span>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                      isObjectQueryActive ? 'bg-cyan-800 text-white' : 'text-cyan-300 bg-cyan-500/15'
                    }`}
                  >
                    {isObjectQueryActive ? 'KAPAT' : 'SOR'}
                  </span>
                </button>
              )}

              {/* Zemin Sınıfı (TBDY 2018) */}
              {onOpenSoilAnalysis && (
                <button
                  type="button"
                  onClick={() => onOpenSoilAnalysis('soil')}
                  className="w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 text-slate-300 hover:text-white hover:bg-amber-500/15"
                  title="TBDY 2018 Zemin Sınıfları (ZA-ZF), Vs30, Taşıma Gücü ve Jeoteknik Raporu"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Mountain className="w-3.5 h-3.5 stroke-[2] shrink-0 text-amber-400" />
                    <span className="text-[11px] truncate">Zemin Sınıfı</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
                    ZA-ZF
                  </span>
                </button>
              )}

              {/* Topoğrafik Eğim */}
              {onOpenSoilAnalysis && (
                <button
                  type="button"
                  onClick={() => onOpenSoilAnalysis('slope')}
                  className="w-full h-8 px-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 text-slate-300 hover:text-white hover:bg-emerald-500/15"
                  title="Topoğrafik Eğim, Kot Farkı, Açığa Çıkan Katlar ve Uygunluk Raporu"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingUp className="w-3.5 h-3.5 stroke-[2] shrink-0 text-emerald-400" />
                    <span className="text-[11px] truncate">Topoğrafik Eğim</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                    UÖ/ÖA
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= AYRI SÜRÜKLENEBİLİR GÖRÜNÜRLÜK PANELİ ================= */}
      {!isVisibilityOpen && (
        <div
          ref={visibilityPanelRef}
          onPointerDown={handleVisibilityDragStart}
          style={{ left: `${visibilityPos.x}px`, top: `${visibilityPos.y}px` }}
          className="no-print fixed z-[998] apple-glass rounded-full px-2.5 h-9 flex items-center gap-1.5 text-white shadow-[0_12px_36px_rgba(0,0,0,0.45)] border border-white/15 cursor-grab active:cursor-grabbing select-none touch-none"
          title="Sürükleyerek taşıyabilir veya tıklayarak Görünürlük panelini açabilirsiniz"
        >
          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <button
            type="button"
            onClick={() => setIsVisibilityOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-100 hover:text-blue-300 transition pr-1"
          >
            <Eye className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
            <span>Görünürlük</span>
          </button>
        </div>
      )}

      {isVisibilityOpen && (
        <div
          ref={visibilityPanelRef}
          style={{ left: `${visibilityPos.x}px`, top: `${visibilityPos.y}px` }}
          className="no-print fixed z-[998] w-52 flex flex-col p-2.5 apple-glass rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.55)] border border-white/15 text-white select-none animate-in fade-in duration-150"
        >
          {/* Sürüklenebilir Başlık */}
          <div
            onPointerDown={handleVisibilityDragStart}
            className="flex items-center justify-between px-1 py-1 border-b border-white/[0.08] mb-1.5 cursor-grab active:cursor-grabbing touch-none"
            title="Başlıktan tutup ekranda istediğiniz yere sürükleyin"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <Eye className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
              <span>Görünürlük</span>
            </div>
            <button
              type="button"
              onClick={() => setIsVisibilityOpen(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Görünürlük Panelini Gizle"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-0.5">
            {[
              {
                key: 'showCadastre',
                label: 'Balastro (Köşe)',
                title: 'Parsel Köşe Numaralarını ve Kırık Daire Noktalarını Aç / Kapat',
                icon: Landmark,
                activeColor: 'text-cyan-400'
              },
              {
                key: 'showFill',
                label: 'Dolgu',
                title: 'Parsel Dolgularını Aç / Kapat',
                icon: Droplets,
                activeColor: 'text-emerald-400'
              },
              {
                key: 'showNames',
                label: 'Parsel No',
                title: 'Parsel Numaralarını Aç / Kapat',
                icon: Hash,
                activeColor: 'text-blue-400'
              },
              {
                key: 'showAreas',
                label: 'Alan (m²)',
                title: 'Parsel Alanlarını Aç / Kapat',
                icon: Maximize2,
                activeColor: 'text-amber-400'
              },
              {
                key: 'showEdgeLengths',
                label: 'Kenar (m)',
                title: 'Kenar Ölçülerini Aç / Kapat',
                icon: Ruler,
                activeColor: 'text-purple-400'
              },
              {
                key: 'showSlopeInfo',
                label: 'Eğim Bilgisi',
                title: 'Parsel Topoğrafik Eğim ve Kot Farkı Bilgisini Aç / Kapat',
                icon: Mountain,
                activeColor: 'text-teal-400'
              },
              {
                key: 'showSoilInfo',
                label: 'Zemin Bilgisi',
                title: 'Parsel Jeoteknik Zemin Alan Bilgisini (TBDY 2018) Aç / Kapat',
                icon: HardHat,
                activeColor: 'text-amber-400'
              }
            ].map((item) => {
              const isChecked =
                item.key === 'showCadastre'
                  ? (mapSettings.showCadastre ?? true)
                  : item.key === 'showSlopeInfo'
                  ? (mapSettings.showSlopeInfo ?? true)
                  : item.key === 'showSoilInfo'
                  ? (mapSettings.showSoilInfo ?? true)
                  : !!(mapSettings as any)[item.key];
              const Icon = item.icon;
              return (
                <div key={item.key} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onChangeMapSettings) {
                        onChangeMapSettings({ ...mapSettings, [item.key]: !isChecked });
                      }
                    }}
                    className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                      isChecked
                        ? 'bg-white/15 text-white font-semibold border border-white/10 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                    }`}
                    title={item.title}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 stroke-[2] ${isChecked ? item.activeColor : 'text-slate-500'}`} />
                      <span className="text-[11px]">{item.label}</span>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                        isChecked
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'text-slate-500 bg-white/[0.03]'
                      }`}
                    >
                      {isChecked ? 'AÇIK' : 'KAPALI'}
                    </span>
                  </button>

                  {/* Dolgu Saydamlığı (Görünürlük İçerisinde) */}
                  {item.key === 'showFill' && (
                    <div className="px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-300 font-medium flex items-center gap-1">
                          <Droplets className="w-3 h-3 text-emerald-400" />
                          <span>Dolgu Saydamlığı</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400">
                          %{mapSettings.parcelFillOpacity ?? 45}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={85}
                        value={mapSettings.parcelFillOpacity ?? 45}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          if (onChangeMapSettings) {
                            onChangeMapSettings({ ...mapSettings, parcelFillOpacity: val, showFill: val > 0 });
                          }
                        }}
                        className="w-full h-1.5 bg-white/10 rounded-full accent-emerald-500 cursor-pointer"
                      />
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { label: '%0', val: 0, title: 'Saydam (Sadece Çerçeve)' },
                          { label: '%25', val: 25, title: 'Hafif' },
                          { label: '%45', val: 45, title: 'Dengeli' },
                          { label: '%75', val: 75, title: 'Yoğun' }
                        ].map((preset) => (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => {
                              if (onChangeMapSettings) {
                                onChangeMapSettings({ ...mapSettings, parcelFillOpacity: preset.val, showFill: preset.val > 0 });
                              }
                            }}
                            className={`text-[9.5px] py-0.5 rounded-md font-mono transition border ${
                              (mapSettings.parcelFillOpacity ?? 45) === preset.val
                                ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400 shadow-sm'
                                : 'bg-white/[0.04] text-slate-300 hover:text-white border-white/[0.06] hover:bg-white/10'
                            }`}
                            title={preset.title}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Kenar Uzunlukları Dinamik Artı / Eksi Boyut Ayarı */}
                  {item.key === 'showEdgeLengths' && isChecked && (
                    <div className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                      <span className="text-[9.5px] text-slate-400 font-medium">Boyut</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onChangeMapSettings) {
                              const cur = mapSettings.edgeLabelScale ?? 100;
                              onChangeMapSettings({ ...mapSettings, edgeLabelScale: Math.max(70, cur - 15) });
                            }
                          }}
                          disabled={(mapSettings.edgeLabelScale ?? 100) <= 70}
                          className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-bold flex items-center justify-center transition"
                          title="Kenar uzunluğu yazılarını küçült (-)"
                        >
                          -
                        </button>
                        <span className="text-[10px] font-mono font-bold text-purple-300 min-w-[34px] text-center">
                          %{mapSettings.edgeLabelScale ?? 100}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onChangeMapSettings) {
                              const cur = mapSettings.edgeLabelScale ?? 100;
                              onChangeMapSettings({ ...mapSettings, edgeLabelScale: Math.min(190, cur + 15) });
                            }
                          }}
                          disabled={(mapSettings.edgeLabelScale ?? 100) >= 190}
                          className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-bold flex items-center justify-center transition"
                          title="Kenar uzunluğu yazılarını büyüt (+)"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Öznitelik Bilgileri Butonu */}
            {onOpenAttributeDrawer && (
              <button
                type="button"
                onClick={() => onOpenAttributeDrawer()}
                className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                  isAttributeDrawerOpen
                    ? 'bg-amber-500 text-slate-950 font-bold border border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-white/[0.08] hover:bg-white/15 text-slate-200 hover:text-white border border-white/10'
                }`}
                title="Yüklenen KML/GeoJSON Dosyalarının Öznitelik Bilgileri Tablosunu Aç"
              >
                <div className="flex items-center gap-1.5">
                  <TableProperties className={`w-3.5 h-3.5 stroke-[2] ${isAttributeDrawerOpen ? 'text-slate-950' : 'text-amber-400'}`} />
                  <span className="text-[11px]">Öznitelikler</span>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                    isAttributeDrawerOpen
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                  }`}
                >
                  {loadedParcelsCount !== undefined && loadedParcelsCount > 0 ? `${loadedParcelsCount} Parsel` : 'TABLO'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Aktif Çizim / Silme Bilgilendirme ve Dinamik Ölçü HUD Rozeti */}
      {activeDrawTool && (
        <div className="absolute top-16 right-64 z-[990] flex flex-col items-end gap-2 animate-in fade-in slide-in-from-top-1 pointer-events-none">
          {/* Ana Bilgi Rozeti */}
          <div className="h-8 px-3.5 bg-slate-900/90 backdrop-blur-xl border border-white/20 text-white text-xs font-medium rounded-full flex items-center gap-2 shadow-lg pointer-events-auto">
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${
                activeDrawTool === 'polygon'
                  ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                  : activeDrawTool === 'line'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span>
              {activeDrawTool === 'polygon' &&
                'Elle Parsel Çizimi Aktif: Köşeleri tıklayın, bitirmek için ilk noktaya veya çift tıklayın.'}
              {activeDrawTool === 'line' &&
                'İmar Yolu Çizimi Aktif: Haritada güzergahı tıklayın, bitirmek için çift tıklayın.'}
              {activeDrawTool === 'delete' &&
                'Silme Modu Aktif: Silmek istediğiniz parsel veya çizgiye haritada tıklayın.'}
            </span>
            <button
              onClick={() => {
                const map = mapRef.current;
                if (map) {
                  map.pm.disableDraw();
                  if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
                }
                setActiveDrawTool(null);
                setDrawingLiveMetrics(null);
                if (drawMeasurementsGroupRef.current) {
                  drawMeasurementsGroupRef.current.clearLayers();
                }
              }}
              className="ml-1 text-slate-400 hover:text-white text-[11px] underline"
            >
              İptal
            </button>
          </div>

          {/* Dinamik Alan ve Mesafe Canlı Gösterge Kartı (Elle Parsel Çizilirken) */}
          {activeDrawTool === 'polygon' && drawingLiveMetrics && (
            <div className="apple-glass rounded-2xl p-2.5 px-3.5 border border-cyan-500/40 shadow-2xl text-white flex items-center gap-3 backdrop-blur-2xl pointer-events-auto animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-1.5 text-cyan-400 border-r border-white/10 pr-3">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Canlı Ölçüm</span>
              </div>

              {/* Anlık Kenar Mesafesi */}
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 font-semibold uppercase">Son Kenar Mesafesi</span>
                <span className="font-mono font-bold text-amber-300 text-xs">
                  {drawingLiveMetrics.currentEdgeLengthM > 0
                    ? `${drawingLiveMetrics.currentEdgeLengthM.toFixed(1)} m`
                    : 'Köşe Bekleniyor...'}
                </span>
              </div>

              <div className="h-6 w-px bg-white/10" />

              {/* Toplam Çevre */}
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 font-semibold uppercase">Toplam Çevre</span>
                <span className="font-mono font-bold text-slate-200 text-xs">
                  {drawingLiveMetrics.totalPerimeterM > 0
                    ? `${drawingLiveMetrics.totalPerimeterM.toFixed(1)} m`
                    : '0.0 m'}
                </span>
              </div>

              <div className="h-6 w-px bg-white/10" />

              {/* Dinamik Parsel Alanı */}
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 font-semibold uppercase">Hesaplanan Parsel Alanı</span>
                <span className="font-mono font-extrabold text-emerald-400 text-sm">
                  {drawingLiveMetrics.approxAreaM2 > 0
                    ? `${drawingLiveMetrics.approxAreaM2.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} m²`
                    : 'Min 3 köşe'}
                </span>
              </div>

              <div className="h-6 w-px bg-white/10" />

              {/* Köşe Adedi */}
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-slate-400 font-semibold uppercase">Köşe</span>
                <span className="font-mono font-bold text-blue-300 text-xs">
                  {drawingLiveMetrics.vertexCount}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sürükle-Bırak Tevhit Aktif Bilgilendirme Rozeti */}
      {mapSettings.enableDragMerge && (
        <div className="absolute top-16 right-64 z-[990] h-8 px-3.5 bg-purple-950/85 backdrop-blur-xl border border-purple-500/40 text-purple-200 text-xs font-medium rounded-full flex items-center gap-2 shadow-lg shadow-purple-900/30 animate-in fade-in slide-in-from-top-1">
          <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          <span>Sürükle-Bırak Tevhit Aktif: Parseli diğerinin üzerine bırakın</span>
          <button
            onClick={() => onToggleDragMerge && onToggleDragMerge()}
            className="ml-1 text-purple-300 hover:text-white"
            title="Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Cut Angle Floating Control Bar */}
      {isAdjustingCutAngle && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] h-10 px-4 bg-amber-500 text-slate-950 font-semibold rounded-full flex items-center gap-2.5 shadow-[0_12px_36px_rgba(245,158,11,0.4)] animate-in fade-in slide-in-from-top-2">
          <RotateCw className="w-4 h-4 stroke-[2.5]" />
          <span className="text-xs font-bold whitespace-nowrap">
            Kesim Açısı: <span className="font-mono">{cutAngle.toFixed(1)}°</span>
          </span>
          {onChangeCutAngle && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChangeCutAngle(Math.max(0, Math.round((cutAngle - 1) * 10) / 10))}
                className="w-6 h-6 rounded-full bg-slate-950/15 hover:bg-slate-950/25 text-xs font-bold flex items-center justify-center transition"
                title="1° Azalt"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => onChangeCutAngle(Math.min(180, Math.round((cutAngle + 1) * 10) / 10))}
                className="w-6 h-6 rounded-full bg-slate-950/15 hover:bg-slate-950/25 text-xs font-bold flex items-center justify-center transition"
                title="1° Arttır"
              >
                +
              </button>
            </div>
          )}
          {onToggleAdjustCutAngle && (
            <button
              type="button"
              onClick={onToggleAdjustCutAngle}
              className="h-6 px-2.5 bg-slate-950 text-amber-300 hover:bg-slate-900 text-[11px] font-bold rounded-full flex items-center gap-1 transition"
            >
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Tamam</span>
            </button>
          )}
        </div>
      )}

      {/* Apple-style Floating CAD Toolbar on Top of Map */}
      {mapSettings.cadModeActive && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] h-11 px-3 bg-slate-950/80 backdrop-blur-2xl border border-white/10 rounded-full flex items-center gap-2 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] text-slate-100 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-1.5 px-2 text-xs font-medium text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>CAD</span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Vertex Edit Tool */}
          <button
            onClick={() => onChangeCadTool && onChangeCadTool('vertex')}
            className={`h-7 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              mapSettings.cadActiveTool === 'vertex'
                ? 'bg-white/20 text-white shadow-sm border border-white/10'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Köşeleri ve kırık noktaları çekiştirerek parseli serbestçe düzenleyin"
          >
            <Move className="w-3 h-3 stroke-[2]" />
            <span>Elle Köşe Düzelt</span>
          </button>

          {/* Slice Tool */}
          <button
            onClick={() => onChangeCadTool && onChangeCadTool('slice')}
            className={`h-7 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              mapSettings.cadActiveTool === 'slice'
                ? 'bg-rose-500/80 text-white shadow-sm border border-rose-400/40'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Harita üzerine çizgi çizerek istediğiniz parseli ikiye bölün"
          >
            <Scissors className="w-3 h-3 stroke-[2]" />
            <span>Çizgiyle Böl</span>
          </button>

          {/* Vertex Coordinate Table Toggle */}
          <button
            onClick={() => setShowVertexTable((prev) => !prev)}
            className={`h-7 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              showVertexTable
                ? 'bg-white/20 text-white shadow-sm border border-white/10'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Seçili parselin TUREF / WGS84 köşe koordinatlarını inceleyin"
          >
            <Table className="w-3 h-3 stroke-[2]" />
            <span>Koordinatlar</span>
          </button>
          {/* Dolgu Saydamlığı Toggle */}
          <button
            onClick={() => {
              if (onChangeMapSettings) {
                const current = mapSettings.parcelFillOpacity ?? 45;
                const nextVal = current === 0 ? 25 : current === 25 ? 45 : current === 45 ? 75 : 0;
                onChangeMapSettings({ ...mapSettings, parcelFillOpacity: nextVal, showFill: nextVal > 0 });
              }
            }}
            className="h-7 px-2.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-white/10 whitespace-nowrap"
            title={`Parsel Dolgu Saydamlığı: %${mapSettings.parcelFillOpacity ?? 45} (Tıklayarak döngüsel değiştir)`}
          >
            <Droplets className="w-3 h-3 stroke-[2] text-emerald-400" />
            <span>Dolgu %{mapSettings.parcelFillOpacity ?? 45}</span>
          </button>

          <div className="h-4 w-px bg-white/10" />

          {/* Done / Exit CAD Mode */}
          <button
            onClick={() => onToggleCadMode && onToggleCadMode(false)}
            className="h-7 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold rounded-full text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Tamamla</span>
          </button>
        </div>
      )}

      {/* Dynamic Line Mode Sub-Bar when Elle Köşe Düzelt (CAD Vertex Edit) is Active */}
      {mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex' && (
        <div className="absolute top-[116px] left-1/2 -translate-x-1/2 z-[995] h-8 px-2.5 bg-slate-950/85 backdrop-blur-2xl border border-white/15 rounded-full flex items-center gap-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)] text-slate-200 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-1 pr-1.5 text-[10px] font-semibold text-cyan-300 whitespace-nowrap">
            <Magnet className="w-3 h-3 stroke-[2.2]" />
            <span>Dinamik Hat:</span>
          </div>
          {(
            [
              { id: 'auto', label: 'Akıllı Hat', title: 'Kenar, 90° dik, kesim ekseni ve parsel sınırına otomatik kenetlenerek sürükler' },
              { id: 'edge', label: 'Kenar Hattı', title: 'Köşeyi yalnızca komşu kenar doğrultusu veya 90° dik hat boyunca kaydırır' },
              { id: 'cut', label: 'Kesim Ekseni', title: 'Köşeyi yalnızca aktif kesim açısı ekseni boyunca kaydırır' },
              { id: 'boundary', label: 'Sınır Hattı', title: 'Köşeyi ana parsel veya komşu parsel sınırı üzerinde kaydırır' },
              { id: 'free', label: 'Serbest', title: 'Hat kilidi olmadan serbest sürükleme' }
            ] as const
          ).map((modeOpt) => (
            <button
              key={modeOpt.id}
              type="button"
              onClick={() => setDynamicLineMode(modeOpt.id)}
              title={modeOpt.title}
              className={`h-6 px-2.5 rounded-full text-[10px] font-medium transition whitespace-nowrap ${
                dynamicLineMode === modeOpt.id
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {modeOpt.label}
            </button>
          ))}

          {parcels.length > 1 && (
            <>
              <div className="h-3.5 w-px bg-white/15 mx-0.5" />
              <button
                type="button"
                onClick={() => setSyncSharedVertices((prev) => !prev)}
                title="Ortak Köşe Senkronu: İfraz parsellerinin paylaştığı köşeleri birlikte kaydırır"
                className={`h-6 px-2 rounded-full text-[10px] font-medium transition flex items-center gap-1 whitespace-nowrap ${
                  syncSharedVertices
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Link2 className="w-3 h-3" />
                <span>Ortak Köşe</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Live HUD During Vertex Drag on Dynamic Line */}
      {vertexDragHud && (
        <div
          className={`fixed ${
            showVertexTable ? 'top-[156px]' : 'bottom-16'
          } left-1/2 -translate-x-1/2 z-[1010] apple-glass rounded-2xl px-4 py-2 border border-cyan-500/40 shadow-2xl text-white flex items-center gap-3.5 pointer-events-none backdrop-blur-2xl animate-in zoom-in-95 duration-100`}
        >
          <div className="flex items-center gap-2 border-r border-white/10 pr-3">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: vertexDragHud.activeLineColor }}
            />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">
                P{vertexDragHud.vertexIndex} {vertexDragHud.isNewVertex ? '(Yeni Kırık)' : ''} · {vertexDragHud.parcelName}
              </span>
              <span className="text-[11px] font-bold" style={{ color: vertexDragHud.activeLineColor }}>
                {vertexDragHud.activeLineLabel || 'Serbest Sürükleme'}
                {vertexDragHud.activeLineBearingDeg !== null ? ` (${vertexDragHud.activeLineBearingDeg.toFixed(1)}°)` : ''}
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 font-semibold uppercase">Komşu Kenarlar</span>
            <span className="font-mono font-bold text-xs text-sky-300">
              {vertexDragHud.prevEdgeM.toFixed(2)} m · {vertexDragHud.nextEdgeM.toFixed(2)} m
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 font-semibold uppercase">Kayma</span>
            <span className="font-mono font-bold text-xs text-amber-300">
              {vertexDragHud.displacementM.toFixed(2)} m
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 font-semibold uppercase">Yeni Alan</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-extrabold text-xs text-emerald-400">
                {vertexDragHud.areaM2.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} m²
              </span>
              <span
                className={`font-mono text-[10px] font-bold ${
                  vertexDragHud.areaDeltaM2 >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                ({vertexDragHud.areaDeltaM2 >= 0 ? '+' : ''}
                {vertexDragHud.areaDeltaM2.toFixed(1)})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating CAD Vertex Coordinate Table (TUREF TM 3°, TUREF UTM 6°, WGS84) */}
      {showVertexTable && cadActiveParcel && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1000] w-[580px] max-w-[95vw] apple-glass rounded-2xl p-4 shadow-[0_24px_64px_rgba(0,0,0,0.6)] border border-white/10 text-xs space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
            <div className="flex items-center gap-2 font-medium text-white min-w-0">
              <Table className="w-4 h-4 text-blue-400 stroke-[1.75] shrink-0" />
              <span className="tracking-tight truncate">Köşe Koordinatları — {cadActiveParcel.name}</span>
              <span className="text-emerald-400 font-mono text-[11px] font-medium shrink-0">({cadActiveParcel.areaM2.toFixed(1)} m²)</span>
            </div>
            <button
              onClick={() => setShowVertexTable(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
              title="Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Koordinat Sistemi & Parsel Seçici Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1 bg-white/[0.06] p-0.5 rounded-lg border border-white/10">
              {(['TUREF_TM3', 'TUREF_UTM6', 'WGS84'] as CoordinateSystemId[]).map((sys) => (
                <button
                  key={sys}
                  type="button"
                  onClick={() => setCoordSystem(sys)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition whitespace-nowrap ${
                    coordSystem === sys
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {getCoordinateSystemDisplayName(sys)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {coordSystem === 'TUREF_TM3' && (
                <select
                  value={selectedDom}
                  onChange={(e) => setSelectedDom(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
                  className="bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-blue-400"
                  title="Dilim Orta Meridyeni (DOM)"
                >
                  <option value="auto">DOM: Oto ({detectedAutoDom}°)</option>
                  {TURKEY_TM3_DOMS.map((dom) => (
                    <option key={dom} value={dom}>
                      DOM {dom}° (TM{dom})
                    </option>
                  ))}
                </select>
              )}

              {parcels.length > 1 && (
                <select
                  value={cadActiveParcel.id}
                  onChange={(e) => setSelectedVertexParcelId(e.target.value)}
                  className="bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-blue-400 max-w-[140px]"
                  title="Koordinatı görüntülenecek parseli seçin"
                >
                  {parcels.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>
              {coordSystem === 'TUREF_TM3'
                ? `Sistem: TUREF TM${effectiveDom} (DOM ${effectiveDom}°) · ${getTurefTm3Epsg(effectiveDom)}`
                : coordSystem === 'TUREF_UTM6'
                ? `Sistem: TUREF UTM 6° (Dilim ${utmZoneDisplay.zone}N) · ${utmZoneDisplay.epsg}`
                : 'Sistem: WGS84 Coğrafi · EPSG:4326'}
            </span>
            <span>{activeVertices.length} Köşe Noktası</span>
          </div>

          <div className="max-h-48 overflow-y-auto pr-1">
            <table className="w-full text-left font-mono tabular-nums text-[11px] text-slate-300">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 text-[10px] tracking-wider">
                  <th className="py-1.5 font-medium">Nokta</th>
                  <th className="py-1.5 font-medium text-right">
                    {coordSystem === 'WGS84' ? 'Boylam (λ)' : coordSystem === 'TUREF_UTM6' ? 'Sağa (E) [m]' : 'Sağa (Y) [m]'}
                  </th>
                  <th className="py-1.5 font-medium text-right">
                    {coordSystem === 'WGS84' ? 'Enlem (φ)' : coordSystem === 'TUREF_UTM6' ? 'Yukarı (N) [m]' : 'Yukarı (X) [m]'}
                  </th>
                  <th className="py-1.5 text-right font-medium">Kenar (m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {activeVertices.map((v) => {
                  const formatted = formatCoordinateInSystem(
                    v.lng,
                    v.lat,
                    coordSystem,
                    coordSystem === 'TUREF_TM3' ? effectiveDom : undefined
                  );
                  return (
                    <tr key={v.index} className="hover:bg-white/[0.04] transition-colors">
                      <td className="py-1.5 text-blue-400 font-medium">P{v.index}</td>
                      <td className="py-1.5 text-right">{formatted.xFormatted}</td>
                      <td className="py-1.5 text-right">{formatted.yFormatted}</td>
                      <td className="py-1.5 text-right text-emerald-400 font-medium">{v.lengthToNextM.toFixed(2)} m</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-white/[0.08] pt-2">
            <span className="font-normal text-[10px] text-slate-400">
              Elle köşe düzeltmede noktaları sürükleyerek koordinatları canlı güncelleyebilirsiniz.
            </span>
            <button
              type="button"
              onClick={() => {
                const header =
                  coordSystem === 'WGS84'
                    ? 'Nokta,Boylam_X,Enlem_Y,Mesafe_m,Sistem'
                    : `Nokta,Saga_Y_m,Yukari_X_m,Mesafe_m,Sistem`;
                const csvData = activeVertices
                  .map((v) => {
                    const fmt = formatCoordinateInSystem(
                      v.lng,
                      v.lat,
                      coordSystem,
                      coordSystem === 'TUREF_TM3' ? effectiveDom : undefined
                    );
                    return `P${v.index},${fmt.xFormatted},${fmt.yFormatted},${v.lengthToNextM.toFixed(2)},${fmt.zoneLabel}`;
                  })
                  .join('\n');
                navigator.clipboard.writeText(`${header}\n${csvData}`);
                setCopiedCoords(true);
                setTimeout(() => setCopiedCoords(false), 2000);
              }}
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium text-[11px] transition shrink-0"
            >
              {copiedCoords ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Listeyi Kopyala</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
      {/* Floating Obje Sor Bar & Inspection Card */}
      {isObjectQueryActive && (
        <div className="no-print absolute top-16 left-1/2 -translate-x-1/2 z-[1000] h-9 px-4 bg-cyan-500 text-slate-950 font-semibold rounded-full flex items-center gap-2.5 shadow-[0_12px_36px_rgba(6,182,212,0.4)] animate-in fade-in slide-in-from-top-2">
          <Info className="w-4 h-4 stroke-[2.5] animate-pulse" />
          <span className="text-xs font-bold whitespace-nowrap">
            Obje Sor Aktif: Haritada parsel, yol veya koordinat tıklayın
          </span>
          {onToggleObjectQuery && (
            <button
              type="button"
              onClick={() => {
                onToggleObjectQuery();
                setInspectedObject(null);
              }}
              className="h-6 px-2.5 bg-slate-950 text-cyan-300 hover:bg-slate-900 text-[11px] font-bold rounded-full flex items-center gap-1 transition"
            >
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Kapat</span>
            </button>
          )}
        </div>
      )}

      {inspectedObject && (
        <div className="no-print fixed bottom-16 right-4 z-[1005] w-80 max-w-[92vw] apple-glass rounded-2xl p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2">
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0 mt-0.5">
                {inspectedObject.kind === 'map-point' ? (
                  <MapPin className="w-3.5 h-3.5 text-cyan-300" />
                ) : (
                  <Info className="w-3.5 h-3.5 text-cyan-300" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{inspectedObject.title}</div>
                {inspectedObject.subtitle && (
                  <div className="text-[10px] text-cyan-300 font-medium truncate">{inspectedObject.subtitle}</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectedObject(null)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
              title="Obje Bilgisini Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Kadastral Konum */}
          {(inspectedObject.il || inspectedObject.adaNo || inspectedObject.parselNo) && (
            <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[10.5px] flex items-center justify-between gap-2">
              <span className="text-slate-300 truncate">
                {[inspectedObject.il, inspectedObject.ilce, inspectedObject.mahalle].filter(Boolean).join(' / ')}
              </span>
              {(inspectedObject.adaNo || inspectedObject.parselNo) && (
                <span className="font-mono font-bold text-amber-300 shrink-0">
                  {inspectedObject.adaNo}/{inspectedObject.parselNo}
                </span>
              )}
            </div>
          )}

          {/* Temel Metrikler */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {inspectedObject.areaM2 !== undefined && (
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-[9px] text-slate-400 uppercase font-semibold">Alan</div>
                <div className="font-mono font-bold text-emerald-400">
                  {inspectedObject.areaM2.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} m²
                </div>
              </div>
            )}
            {inspectedObject.perimeterM !== undefined && (
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-[9px] text-slate-400 uppercase font-semibold">Çevre</div>
                <div className="font-mono font-bold text-sky-300">
                  {inspectedObject.perimeterM.toFixed(2)} m
                </div>
              </div>
            )}
            {inspectedObject.lengthM !== undefined && (
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-[9px] text-slate-400 uppercase font-semibold">Uzunluk</div>
                <div className="font-mono font-bold text-amber-300">
                  {inspectedObject.lengthM.toFixed(2)} m
                </div>
              </div>
            )}
            {inspectedObject.vertexCount !== undefined && (
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-[9px] text-slate-400 uppercase font-semibold">Köşe Sayısı</div>
                <div className="font-mono font-bold text-slate-200">{inspectedObject.vertexCount} Nokta</div>
              </div>
            )}
          </div>

          {/* Tıklanan Nokta Koordinatları (WGS84 & TUREF TM3) */}
          {(() => {
            const [lat, lng] = inspectedObject.latlng;
            const dom = getAutoTurefDom(lng);
            const turef = formatCoordinateInSystem(lng, lat, 'TUREF_TM3', dom);
            return (
              <div className="px-2.5 py-1.5 rounded-xl bg-black/30 border border-white/[0.07] font-mono text-[10px] space-y-0.5">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">WGS84:</span>
                  <span>
                    {lat.toFixed(6)}, {lng.toFixed(6)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-cyan-300">
                  <span className="text-slate-400">TM{dom} (Y / X):</span>
                  <span>
                    {turef.xFormatted} / {turef.yFormatted}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Kenar Uzunlukları */}
          {inspectedObject.edgeLengthsM && inspectedObject.edgeLengthsM.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9.5px] text-slate-400 uppercase font-bold tracking-wider">Kenar Uzunlukları</div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {inspectedObject.edgeLengthsM.map((len, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] font-mono text-[10px] text-slate-200"
                  >
                    K{idx + 1}: <b className="text-purple-300">{len.toFixed(2)}m</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Zemin & Topoğrafik Eğim Özeti */}
          {(inspectedObject.soilClass || inspectedObject.avgSlopePercent !== undefined) && (
            <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
              {inspectedObject.soilClass && (
                <div className="px-2 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                  <div className="text-[9px] text-amber-300/80 uppercase font-bold">Zemin (TBDY)</div>
                  <div className="font-mono font-bold text-amber-300">
                    {inspectedObject.soilClass} · qa {inspectedObject.bearingCapacity}
                  </div>
                </div>
              )}
              {inspectedObject.avgSlopePercent !== undefined && (
                <div className="px-2 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="text-[9px] text-emerald-300/80 uppercase font-bold">Topoğrafik Eğim</div>
                  <div className="font-mono font-bold text-emerald-300">
                    %{inspectedObject.avgSlopePercent} ({inspectedObject.aspect}) · ΔZ {inspectedObject.elevationDiffM}m
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hızlı Sorgu & İşlem Butonları */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.08]">
            {onOpenSoilAnalysis &&
              (inspectedObject.kind === 'generated-parcel' ||
                inspectedObject.kind === 'main-parcel' ||
                inspectedObject.kind === 'secondary-parcel') && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenSoilAnalysis('soil', inspectedObject.id)}
                    className="flex-1 h-7 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-[10.5px] font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <Mountain className="w-3 h-3" />
                    <span>Zemin Sınıfı</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSoilAnalysis('slope', inspectedObject.id)}
                    className="flex-1 h-7 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 text-[10.5px] font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <TrendingUp className="w-3 h-3" />
                    <span>Eğim Analizi</span>
                  </button>
                </>
              )}

            {onPickTkgmCoord && (
              <button
                type="button"
                onClick={() => onPickTkgmCoord(inspectedObject.latlng[0], inspectedObject.latlng[1])}
                className="h-7 px-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 text-[10.5px] font-semibold flex items-center justify-center gap-1 transition"
                title="Bu koordinattaki parsel bilgisini TKGM'den sorgula"
              >
                <Landmark className="w-3 h-3" />
                <span>TKGM'den Sor</span>
              </button>
            )}

            {inspectedObject.kind !== 'map-point' && (
              <button
                type="button"
                onClick={() => {
                  if (inspectedObject.kind === 'generated-parcel' && inspectedObject.id) {
                    onDeleteGeneratedParcelRef.current?.(inspectedObject.id);
                  } else if (inspectedObject.kind === 'secondary-parcel' && inspectedObject.id) {
                    onDeleteSecondaryParcelRef.current?.(inspectedObject.id);
                  } else if (inspectedObject.kind === 'road-line' && inspectedObject.roadIndex !== undefined) {
                    onDeleteRoadLineRef.current?.(inspectedObject.roadIndex);
                  } else if (inspectedObject.kind === 'main-parcel') {
                    onClearMainPolygonRef.current?.();
                  }
                  setInspectedObject(null);
                }}
                className="h-7 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 text-[10.5px] font-semibold flex items-center justify-center gap-1 transition"
                title="Seçili objeyi sil"
              >
                <Trash2 className="w-3 h-3" />
                <span>Sil</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
