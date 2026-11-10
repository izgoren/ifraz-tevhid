import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import * as turf from '@turf/turf';
import type { Feature, LineString, Polygon, MultiPolygon } from 'geojson';
import { GeneratedParcel, MapSettings, ParcelGeometry, LoadedCadastralParcel } from '../types';
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
  Landmark
} from 'lucide-react';

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
  onParcelSliced?: (parcelId: string, sliceLine: Feature<LineString>) => void;
  onToggleCadMode?: (active: boolean) => void;
  onChangeCadTool?: (tool: 'select' | 'vertex' | 'slice') => void;
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
  onParcelSliced,
  onToggleCadMode,
  onChangeCadTool,
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
  onActiveDrawToolChange
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mainLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const secondaryParcelsGroupRef = useRef<L.LayerGroup | null>(null);
  const piecesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const edgeLabelsGroupRef = useRef<L.LayerGroup | null>(null);
  const axisLineLayerRef = useRef<L.LayerGroup | null>(null);
  const roadLinesGroupRef = useRef<L.LayerGroup | null>(null);
  const frontageEdgeGroupRef = useRef<L.LayerGroup | null>(null);
  const vertexMarkersGroupRef = useRef<L.LayerGroup | null>(null);
  const morphAnimationGroupRef = useRef<L.LayerGroup | null>(null);
  const drawMeasurementsGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | L.LayerGroup | null>(null);

  const [showVertexTable, setShowVertexTable] = useState(false);
  const [activeDrawTool, setActiveDrawToolState] = useState<'polygon' | 'line' | 'delete' | null>(null);
  const [showOpacityPopover, setShowOpacityPopover] = useState(false);
  const [isRightMenuOpen, setIsRightMenuOpen] = useState(true);

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
      if (externalDrawTool === 'polygon') {
        handleToggleDrawPolygon(true);
      } else if (externalDrawTool === null && activeDrawTool === 'polygon') {
        const map = mapRef.current;
        if (map) {
          map.pm.disableDraw();
        }
        setActiveDrawTool(null);
      }
    }
  }, [externalDrawTool]);

  // Active parcel for CAD Vertex Table
  const cadActiveParcel = useMemo(() => {
    if (selectedParcelIds.length > 0) {
      return parcels.find((p) => p.id === selectedParcelIds[0]) || parcels[0] || null;
    }
    return parcels[0] || null;
  }, [parcels, selectedParcelIds]);

  const activeVertices: ParcelVertex[] = useMemo(() => {
    if (!cadActiveParcel) return [];
    return getParcelVertices(cadActiveParcel.feature);
  }, [cadActiveParcel]);

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

      map.createPane('drawMeasurementPane');
      map.getPane('drawMeasurementPane')!.style.zIndex = '690';

      mainLayerGroupRef.current = L.layerGroup().addTo(map);
      secondaryParcelsGroupRef.current = L.layerGroup().addTo(map);
      piecesLayerGroupRef.current = L.layerGroup().addTo(map);
      edgeLabelsGroupRef.current = L.layerGroup().addTo(map);
      axisLineLayerRef.current = L.layerGroup().addTo(map);
      roadLinesGroupRef.current = L.layerGroup().addTo(map);
      frontageEdgeGroupRef.current = L.layerGroup().addTo(map);
      vertexMarkersGroupRef.current = L.layerGroup().addTo(map);
      morphAnimationGroupRef.current = L.layerGroup().addTo(map);
      drawMeasurementsGroupRef.current = L.layerGroup().addTo(map);

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

  // Render Main Cadastral Boundary
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mainLayerGroupRef.current) return;

    mainLayerGroupRef.current.clearLayers();

    if (mainPolygon) {
      const isDragMergeActive = !!mapSettings.enableDragMerge && !mapSettings.cadModeActive;
      const geoLayer = L.geoJSON(mainPolygon, {
        style: {
          color: isDragMergeActive ? '#10b981' : '#16a34a',
          weight: isDragMergeActive ? 4 : 3.5,
          dashArray: isDragMergeActive ? '6, 4' : '4, 4',
          fillColor: '#22c55e',
          fillOpacity: 0.12
        }
      }).addTo(mainLayerGroupRef.current);

      if (isDragMergeActive && secondaryParcels.length > 0) {
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

      map.fitBounds(geoLayer.getBounds(), { padding: [40, 40] });
    }
  }, [mainPolygon, mapSettings.enableDragMerge, mapSettings.cadModeActive, secondaryParcels, onDragMergeLoadedParcels, playMergeMorphAnimation]);

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

      geoLayer.on('click', () => {
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
        marker.on('click', () => {
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

  // Render Parcels, Vertex Editing, Drag Merge, and Labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !piecesLayerGroupRef.current || !edgeLabelsGroupRef.current) return;

    piecesLayerGroupRef.current.clearLayers();
    edgeLabelsGroupRef.current.clearLayers();

    parcels.forEach((p, idx) => {
      const isSelected = selectedParcelIds.includes(p.id);

      let fillColor = idx % 2 === 0 ? '#0284c7' : '#f59e0b';
      let strokeColor = p.isValid ? '#0284c7' : '#dc2626';

      if (!p.isValid) {
        fillColor = '#ef4444';
      }

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

      // Tooltip content
      const labelParts: string[] = [];
      if (mapSettings.showNames) labelParts.push(`<b>${p.name}</b>`);
      if (mapSettings.showAreas) labelParts.push(`${p.areaM2.toFixed(1)} m²`);
      if (p.frontageM > 0 || (p.rearWidthM !== undefined && p.rearWidthM > 0)) {
        labelParts.push(
          `<span style="font-size: 10px; opacity: 0.95;">Yol: ${p.frontageM.toFixed(1)}m | Bitiş: ${(p.rearWidthM || 0).toFixed(1)}m</span>`
        );
      }
      if (p.topography) {
        labelParts.push(
          `<span style="font-size: 9.5px; color: #6ee7b7; font-weight: 600;">Eğim: %${p.topography.avgSlopePercent} (${p.topography.aspect}) | ΔZ: ${p.topography.elevationDiffM}m</span>`
        );
      }
      if (p.soilClassification) {
        labelParts.push(
          `<span style="font-size: 9px; color: #fcd34d; font-weight: 600;">🏗️ Zemin: ${p.soilClassification.soilClass} (qa: ${p.soilClassification.bearingCapacityKgCm2} kg)</span>`
        );
      }
      if (!p.isValid && p.validationReasons.length > 0) {
        labelParts.push(`<span style="color: #fca5a5; font-size: 9px; font-weight: bold;">⚠️ Min 10m / İmar Uyarısı</span>`);
      }

      if (labelParts.length > 0) {
        geoJsonLayer.bindTooltip(labelParts.join('<br/>'), {
          permanent: true,
          direction: 'center',
          className: `area-tooltip ${isSelected ? 'selected' : ''}`,
          pane: 'labelPane'
        });
      }

      // Click to select
      geoJsonLayer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onParcelSelectToggle(p.id);
      });

      // CAD Mode: Vertex Editing via Geoman pm
      if (mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex') {
        geoJsonLayer.eachLayer((subLayer: any) => {
          if (subLayer.pm) {
            subLayer.pm.enable({
              allowSelfIntersection: false,
              snappable: true,
              snapDistance: 20
            });

            // Listen to vertex drag & edit events
            const handleGeometryEdit = () => {
              const updatedGeo = subLayer.toGeoJSON();
              if (onParcelGeometryUpdated && (updatedGeo.geometry.type === 'Polygon' || updatedGeo.geometry.type === 'MultiPolygon')) {
                onParcelGeometryUpdated(p.id, updatedGeo as ParcelGeometry);
              }
            };

            subLayer.on('pm:edit', handleGeometryEdit);
            subLayer.on('pm:vertexchange', handleGeometryEdit);
            subLayer.on('pm:markerdragend', handleGeometryEdit);
          }
        });
      } else if (!mapSettings.cadModeActive && mapSettings.enableDragMerge) {
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
            if (dist < 0.4) continue; // Skip micro-vertices
            const mid = turf.midpoint(p1, p2);

            // Parallel angle calculation
            const bearing = turf.rhumbBearing(p1, p2);
            let angleDeg = bearing - 90;
            // CAD standard readability: keep text readable left-to-right (no upside down text)
            while (angleDeg > 90) angleDeg -= 180;
            while (angleDeg < -90) angleDeg -= 180;

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

            const labelMarker = L.marker([mid.geometry.coordinates[1], mid.geometry.coordinates[0]], {
              pane: 'labelPane',
              interactive: false,
              icon: L.divIcon({
                className: 'edge-tooltip-wrapper',
                html: `<div class="edge-tooltip parallel ${isRoadFrontageEdge ? 'road-frontage' : ''}" style="transform: rotate(${angleDeg.toFixed(1)}deg); transform-origin: center center;">${dist.toFixed(1)}m${isRoadFrontageEdge ? ' 🛣️' : ''}</div>`,
                iconSize: [64, 20],
                iconAnchor: [32, 10]
              })
            });

            edgeLabelsGroupRef.current.addLayer(labelMarker);
          }
        }
      }
    });
  }, [
    parcels,
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
    if (!isBalastroActive) return;

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
  }, [mainPolygon, parcels, secondaryParcels, mapSettings.showCadastre]);

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

  const handleToggleDrawLine = () => {
    const map = mapRef.current;
    if (!map) return;
    if (activeDrawTool === 'line') {
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

  const handleToggleRemovalMode = () => {
    const map = mapRef.current;
    if (!map) return;
    if (activeDrawTool === 'delete') {
      map.pm.disableGlobalRemovalMode();
      setActiveDrawTool(null);
    } else {
      map.pm.disableDraw();
      if (mapSettings.cadModeActive && onToggleCadMode) onToggleCadMode(false);
      map.pm.enableGlobalRemovalMode();
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

      {/* Kapalı Durumda Sağ Menüyü Açma Butonu */}
      {!isRightMenuOpen && (
        <button
          onClick={() => setIsRightMenuOpen(true)}
          className="absolute top-4 right-4 z-[1000] h-10 px-3.5 apple-glass rounded-full flex items-center gap-2 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/10 hover:border-white/20 active:scale-95 transition"
          title="CAD & Çizim Araçları Menüsünü Aç"
        >
          <PenTool className="w-4 h-4 text-blue-400 stroke-[2]" />
          <span className="font-semibold text-xs">CAD & Çizim</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 rotate-180" />
        </button>
      )}

      {/* Sağ Taraf: CAD Araçları İçerisine Gruplanmış Çizim ve CAD Araç Çubuğu */}
      {isRightMenuOpen && (
        <div className="absolute top-4 right-4 z-[1000] flex flex-col p-2 apple-glass rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/10 text-white animate-in fade-in slide-in-from-right-2 duration-200 w-44">
          {/* Header */}
          <div className="flex items-center justify-between px-1.5 py-1 border-b border-white/[0.08] mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
              <PenTool className="w-3.5 h-3.5 text-blue-400 stroke-[2]" />
              <span>CAD & Çizim</span>
            </div>
            <div className="flex items-center gap-1">
              {(activeDrawTool || mapSettings.cadModeActive || mapSettings.enableDragMerge) && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <button
                onClick={() => setIsRightMenuOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
                title="Sağ Menüyü Gizle"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        {/* Grup 1: Çizim Araçları */}
        <div className="space-y-1">
          <div className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Çizim Araçları
          </div>

          {/* Parsel / Poligon Çiz */}
          <button
            onClick={handleToggleDrawPolygon}
            className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
              activeDrawTool === 'polygon'
                ? 'bg-blue-500 text-white font-bold shadow-md shadow-blue-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Haritada yeni parsel veya poligon çizin (Bitirmek için ilk noktaya veya çift tıklayın)"
          >
            <div className="flex items-center gap-1.5">
              <Shapes className={`w-3.5 h-3.5 stroke-[2] ${activeDrawTool === 'polygon' ? 'text-white' : 'text-blue-400'}`} />
              <span className="text-[11px]">Parsel Çiz</span>
            </div>
            {activeDrawTool === 'polygon' && (
              <span className="text-[9px] bg-blue-700 text-white px-1.5 py-0.5 rounded font-bold">
                ÇİZİLİYOR
              </span>
            )}
          </button>

          {/* İmar Yolu / Çizgi Çiz */}
          <button
            onClick={handleToggleDrawLine}
            className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
              activeDrawTool === 'line'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Harita üzerine imar yolu veya referans çizgisi çizin"
          >
            <div className="flex items-center gap-1.5">
              <Spline className={`w-3.5 h-3.5 stroke-[2] ${activeDrawTool === 'line' ? 'text-slate-950' : 'text-amber-400'}`} />
              <span className="text-[11px]">Yol Çiz</span>
            </div>
            {activeDrawTool === 'line' && (
              <span className="text-[9px] bg-amber-600 text-slate-950 px-1.5 py-0.5 rounded font-bold">
                ÇİZİLİYOR
              </span>
            )}
          </button>

          {/* Katman / Parsel Sil */}
          <button
            onClick={handleToggleRemovalMode}
            className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
              activeDrawTool === 'delete'
                ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Silme modu: Silmek istediğiniz parsel veya çizgiye haritada tıklayın"
          >
            <div className="flex items-center gap-1.5">
              <Trash2 className={`w-3.5 h-3.5 stroke-[2] ${activeDrawTool === 'delete' ? 'text-white' : 'text-rose-400'}`} />
              <span className="text-[11px]">Sil</span>
            </div>
            {activeDrawTool === 'delete' && (
              <span className="text-[9px] bg-rose-700 text-white px-1.5 py-0.5 rounded font-bold">
                AKTİF
              </span>
            )}
          </button>
        </div>

        <div className="h-px bg-white/[0.08] my-1.5 mx-0.5" />

        {/* Grup 2: CAD & Tevhit Araçları */}
        <div className="space-y-1">
          <div className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            CAD & Tevhit
          </div>

          {/* CAD Köşe Düzenle */}
          <button
            onClick={handleToggleCadVertex}
            className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
              mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                : mapSettings.cadModeActive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="CAD Köşe Düzenleme Modu (Vertex Edit): Parsel köşelerini sürükleyerek şekillendirin"
          >
            <div className="flex items-center gap-1.5">
              <Crosshair className={`w-3.5 h-3.5 stroke-[2] ${mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex' ? 'text-slate-950' : 'text-emerald-400'}`} />
              <span className="text-[11px]">CAD Düzenle</span>
            </div>
            {mapSettings.cadModeActive && mapSettings.cadActiveTool === 'vertex' && (
              <span className="text-[9px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-bold">
                AÇIK
              </span>
            )}
          </button>

          {/* CAD Bıçağı */}
          <button
            onClick={handleToggleCadSlice}
            className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
              mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice'
                ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="CAD Bıçağı: Parselin üzerinden geçen serbest çizgi çizerek bölün"
          >
            <div className="flex items-center gap-1.5">
              <Scissors className={`w-3.5 h-3.5 stroke-[2] ${mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice' ? 'text-white' : 'text-rose-400'}`} />
              <span className="text-[11px]">CAD Bıçağı</span>
            </div>
            {mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice' && (
              <span className="text-[9px] bg-rose-700 text-white px-1.5 py-0.5 rounded font-bold">
                AÇIK
              </span>
            )}
          </button>

          {/* Sürükle-Bırak Tevhit */}
          <button
            onClick={() => {
              if (onToggleDragMerge) onToggleDragMerge();
            }}
            className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
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
            <div className="flex items-center gap-1.5">
              <Layers className={`w-3.5 h-3.5 stroke-[2] ${mapSettings.enableDragMerge ? 'text-white' : 'text-purple-400'}`} />
              <span className="text-[11px]">Sürükle Tevhit</span>
            </div>
            {mapSettings.enableDragMerge && (
              <span className="text-[9px] bg-purple-900/90 text-purple-200 px-1.5 py-0.5 rounded font-bold">
                AÇIK
              </span>
            )}
          </button>

          {/* Köşe Koordinatları Tablosu */}
          <button
            onClick={() => setShowVertexTable((prev) => !prev)}
            className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
              showVertexTable
                ? 'bg-blue-500 text-white font-bold shadow-md shadow-blue-500/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Seçili Parsel Köşe Koordinatları Tablosunu Göster/Gizle"
          >
            <div className="flex items-center gap-1.5">
              <Table className={`w-3.5 h-3.5 stroke-[2] ${showVertexTable ? 'text-white' : 'text-blue-400'}`} />
              <span className="text-[11px]">Koordinatlar</span>
            </div>
            {showVertexTable && (
              <span className="text-[9px] bg-blue-700 text-white px-1.5 py-0.5 rounded font-bold">
                AÇIK
              </span>
            )}
          </button>

          {/* Parsel Dolgu Saydamlığı Butonu */}
          <div className="relative">
            <button
              onClick={() => setShowOpacityPopover((prev) => !prev)}
              className={`w-full h-8 px-2 rounded-xl text-xs font-medium transition flex items-center justify-between active:scale-95 ${
                showOpacityPopover
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Parsel Dolgu Saydamlığını Değiştir (Saydam / Opak)"
            >
              <div className="flex items-center gap-1.5">
                <Droplets className={`w-3.5 h-3.5 stroke-[2] ${showOpacityPopover ? 'text-slate-950' : 'text-emerald-400'}`} />
                <span className="text-[11px]">Dolgu Saydamlığı</span>
              </div>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                showOpacityPopover ? 'bg-slate-950/20 text-slate-950' : 'text-emerald-400 bg-emerald-500/10'
              }`}>
                %{mapSettings.parcelFillOpacity ?? 45}
              </span>
            </button>

            {/* Apple-Glass Popover Slider for Fill Opacity */}
            {showOpacityPopover && (
              <div className="absolute right-full top-0 mr-2 z-[1100] w-60 apple-glass rounded-2xl p-3 shadow-2xl border border-white/10 text-white space-y-2.5 animate-in fade-in slide-in-from-right-1 duration-150">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Droplets className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                    <span>Parsel Dolgu Saydamlığı</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    %{mapSettings.parcelFillOpacity ?? 45}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={85}
                  value={mapSettings.parcelFillOpacity ?? 45}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    if (onChangeMapSettings) {
                      onChangeMapSettings({ ...mapSettings, parcelFillOpacity: val, showFill: val > 0 });
                    }
                  }}
                  className="w-full h-1.5 bg-white/10 rounded-full accent-emerald-500 cursor-pointer"
                />

                <div className="grid grid-cols-4 gap-1 pt-1">
                  {[
                    { label: '%0', val: 0, title: 'Saydam (Sadece Çerçeve)' },
                    { label: '%25', val: 25, title: 'Hafif' },
                    { label: '%45', val: 45, title: 'Dengeli' },
                    { label: '%75', val: 75, title: 'Yoğun' }
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      onClick={() => {
                        if (onChangeMapSettings) {
                          onChangeMapSettings({ ...mapSettings, parcelFillOpacity: preset.val, showFill: preset.val > 0 });
                        }
                      }}
                      className={`text-[10px] py-1 rounded-lg font-mono transition border ${
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
          </div>
        </div>

        <div className="h-px bg-white/[0.08] my-1.5 mx-0.5" />

        {/* Grup 3: Görünürlük Katmanları (Bara Sıralı Sabitlenmiş) */}
        <div className="space-y-1">
          <div className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Görünürlük</span>
            <Eye className="w-3 h-3 text-blue-400" />
          </div>

          {[
            {
              key: 'showCadastre',
              label: 'Balastro (Köşe)',
              title: 'Parsel Köşe Numaralarını ve Kırık Daire Noktalarını Aç / Kapat (Parsel Kapanmaz)',
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
            }
          ].map((item) => {
            const isChecked =
              item.key === 'showCadastre'
                ? (mapSettings.showCadastre ?? true)
                : !!(mapSettings as any)[item.key];
            const Icon = item.icon;
            return (
              <button
                key={item.key}
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
            );
          })}

          {/* Öznitelik Bilgileri Butonu */}
          {onOpenAttributeDrawer && (
            <button
              onClick={onOpenAttributeDrawer}
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
        <div className="absolute top-16 right-52 z-[990] flex flex-col items-end gap-2 animate-in fade-in slide-in-from-top-1 pointer-events-none">
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
        <div className="absolute top-16 right-44 z-[990] h-8 px-3.5 bg-purple-950/85 backdrop-blur-xl border border-purple-500/40 text-purple-200 text-xs font-medium rounded-full flex items-center gap-2 shadow-lg shadow-purple-900/30 animate-in fade-in slide-in-from-top-1">
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
            className={`h-7 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
              mapSettings.cadActiveTool === 'vertex'
                ? 'bg-white/20 text-white shadow-sm border border-white/10'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Köşeleri ve kırık noktaları çekiştirerek parseli serbestçe düzenleyin"
          >
            <Move className="w-3 h-3 stroke-[2]" />
            <span>Köşe Taşı</span>
          </button>

          {/* Slice Tool */}
          <button
            onClick={() => onChangeCadTool && onChangeCadTool('slice')}
            className={`h-7 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
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
            className={`h-7 px-3 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
              showVertexTable
                ? 'bg-white/20 text-white shadow-sm border border-white/10'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Seçili parselin köşe koordinatlarını inceleyin"
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
            className="h-7 px-2.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-white/10"
            title={`Parsel Dolgu Saydamlığı: %${mapSettings.parcelFillOpacity ?? 45} (Tıklayarak döngüsel değiştir)`}
          >
            <Droplets className="w-3 h-3 stroke-[2] text-emerald-400" />
            <span>Dolgu %{mapSettings.parcelFillOpacity ?? 45}</span>
          </button>

          <div className="h-4 w-px bg-white/10" />

          {/* Done / Exit CAD Mode */}
          <button
            onClick={() => onToggleCadMode && onToggleCadMode(false)}
            className="h-7 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold rounded-full text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Tamamla</span>
          </button>
        </div>
      )}

      {/* Floating CAD Vertex Coordinate Table (Apple Window Style) */}
      {showVertexTable && cadActiveParcel && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] w-[520px] max-w-[95vw] apple-glass rounded-2xl p-4 shadow-[0_24px_64px_rgba(0,0,0,0.6)] border border-white/10 text-xs space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
            <div className="flex items-center gap-2 font-medium text-white">
              <Table className="w-4 h-4 text-blue-400 stroke-[1.75]" />
              <span className="tracking-tight">Köşe Koordinatları — {cadActiveParcel.name}</span>
              <span className="text-emerald-400 font-mono text-[11px] font-medium">({cadActiveParcel.areaM2.toFixed(1)} m²)</span>
            </div>
            <button
              onClick={() => setShowVertexTable(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto pr-1">
            <table className="w-full text-left font-mono text-[11px] text-slate-300">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 text-[10px] uppercase tracking-wider">
                  <th className="py-1.5 font-medium">Nokta</th>
                  <th className="py-1.5 font-medium">Boylam (X)</th>
                  <th className="py-1.5 font-medium">Enlem (Y)</th>
                  <th className="py-1.5 text-right font-medium">Kenar Boyu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {activeVertices.map((v) => (
                  <tr key={v.index} className="hover:bg-white/[0.04] transition-colors">
                    <td className="py-1.5 text-blue-400 font-medium">P{v.index}</td>
                    <td className="py-1.5">{v.lng.toFixed(6)}</td>
                    <td className="py-1.5">{v.lat.toFixed(6)}</td>
                    <td className="py-1.5 text-right text-emerald-400 font-medium">{v.lengthToNextM.toFixed(2)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-white/[0.08] pt-2">
            <span className="font-normal text-[10px] text-slate-400">Köşeleri haritada sürükleyerek canlı değiştirebilirsiniz.</span>
            <button
              onClick={() => {
                const csvData = activeVertices
                  .map((v) => `P${v.index},${v.lng.toFixed(6)},${v.lat.toFixed(6)},${v.lengthToNextM.toFixed(2)}`)
                  .join('\n');
                navigator.clipboard.writeText(`Nokta,X,Y,Mesafe_m\n${csvData}`);
                alert('Köşe koordinatları panoya kopyalandı.');
              }}
              className="text-blue-400 hover:text-blue-300 font-medium text-[11px] transition"
            >
              Kopyala
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
