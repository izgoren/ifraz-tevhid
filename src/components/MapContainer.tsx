import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import { GeneratedParcel, MapSettings, ParcelGeometry } from '../types';
import { getParcelVertices, ParcelVertex, getMainPolygonEdges, ParcelEdge } from '../utils/geometryOptimizer';
import { Scissors, Move, Check, Crosshair, Table, X, Compass, Navigation } from 'lucide-react';

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
  isDrawingRoadFrontage?: boolean;
  onDoneDrawingRoadFrontage?: () => void;
  isSelectingFrontageEdge?: boolean;
  selectedFrontageEdgeIndex?: number | null;
  onSelectFrontageEdge?: (edgeIndex: number) => void;
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
  isDrawingRoadFrontage = false,
  onDoneDrawingRoadFrontage,
  isSelectingFrontageEdge = false,
  selectedFrontageEdgeIndex = null,
  onSelectFrontageEdge
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mainLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const piecesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const edgeLabelsGroupRef = useRef<L.LayerGroup | null>(null);
  const axisLineLayerRef = useRef<L.LayerGroup | null>(null);
  const roadLinesGroupRef = useRef<L.LayerGroup | null>(null);
  const frontageEdgeGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | L.LayerGroup | null>(null);

  const [showVertexTable, setShowVertexTable] = useState(false);

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

      mainLayerGroupRef.current = L.layerGroup().addTo(map);
      piecesLayerGroupRef.current = L.layerGroup().addTo(map);
      edgeLabelsGroupRef.current = L.layerGroup().addTo(map);
      axisLineLayerRef.current = L.layerGroup().addTo(map);
      roadLinesGroupRef.current = L.layerGroup().addTo(map);
      frontageEdgeGroupRef.current = L.layerGroup().addTo(map);

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

      // Add Geoman drawing controls (top-right)
      map.pm.addControls({
        position: 'topright',
        drawPolygon: true,
        drawPolyline: true,
        drawMarker: false,
        drawCircleMarker: false,
        drawRectangle: false,
        drawCircle: false,
        editMode: true,
        dragMode: false,
        cutPolygon: false,
        removalMode: true
      });

      // Ensure Turkish titles on DOM buttons directly
      setTimeout(() => {
        const polyBtn = document.querySelector('.leaflet-buttons-control-button a.leaflet-pm-icon-polygon, .leaflet-pm-icon-polygon')?.parentElement;
        if (polyBtn) polyBtn.setAttribute('title', 'Parsel / Poligon Çiz');
        const lineBtn = document.querySelector('.leaflet-buttons-control-button a.leaflet-pm-icon-polyline, .leaflet-pm-icon-polyline')?.parentElement;
        if (lineBtn) lineBtn.setAttribute('title', 'İmar Yolu / Çizgi Çiz');
        const editBtn = document.querySelector('.leaflet-buttons-control-button a.leaflet-pm-icon-edit, .leaflet-pm-icon-edit')?.parentElement;
        if (editBtn) editBtn.setAttribute('title', 'Katmanları / Köşeleri Düzenle');
        const deleteBtn = document.querySelector('.leaflet-buttons-control-button a.leaflet-pm-icon-delete, .leaflet-pm-icon-delete')?.parentElement;
        if (deleteBtn) deleteBtn.setAttribute('title', 'Katman / Parsel Sil');
      }, 250);

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
          if (isDrawingRoadFrontage && onDoneDrawingRoadFrontage) {
            onDoneDrawingRoadFrontage();
          }
          if (onRoadLineCreated && geo.geometry.type === 'LineString') {
            onRoadLineCreated(geo as Feature<LineString>);
          }
        } else if (e.shape === 'Polygon' || e.shape === 'Rectangle') {
          if (onPolygonCreated) {
            onPolygonCreated(geo as ParcelGeometry);
          }
        }

        map.removeLayer(e.layer);
      });

      // Handle map window resize smoothly
      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      const mapElem = document.getElementById('map-element');
      if (mapElem) resizeObserver.observe(mapElem);
    }
  }, [onPolygonCreated, onRoadLineCreated, mapSettings.cadModeActive, mapSettings.cadActiveTool, cadActiveParcel, parcels, onParcelSliced, isDrawingRoadFrontage, onDoneDrawingRoadFrontage]);

  // Handle Road Frontage Drawing & CAD Slice Tool Activation in Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isDrawingRoadFrontage) {
      map.pm.enableDraw('Line', {
        snappable: true,
        snapDistance: 20,
        tooltips: true,
        templineStyle: { color: '#f59e0b', dashArray: '8, 8', weight: 4 },
        hintlineStyle: { color: '#f59e0b', dashArray: '4, 4', weight: 2 }
      });
    } else if (mapSettings.cadModeActive && mapSettings.cadActiveTool === 'slice') {
      map.pm.enableDraw('Line', {
        snappable: true,
        snapDistance: 20,
        tooltips: true,
        templineStyle: { color: '#ef4444', dashArray: '6, 6', weight: 3 }
      });
    } else {
      map.pm.disableDraw();
    }
  }, [isDrawingRoadFrontage, mapSettings.cadModeActive, mapSettings.cadActiveTool]);

  // Update Tile Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let newTileLayer: L.Layer;

    switch (mapSettings.tileProvider) {
      case 'googleHybrid':
        newTileLayer = L.layerGroup([
          L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 28, maxNativeZoom: 20 }),
          L.tileLayer('https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}', { maxZoom: 28, maxNativeZoom: 20 })
        ]);
        break;
      case 'googleSatellite':
        newTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          maxZoom: 28,
          maxNativeZoom: 20,
          attribution: 'Google Satellite'
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
      const geoLayer = L.geoJSON(mainPolygon, {
        style: {
          color: '#16a34a',
          weight: 3.5,
          dashArray: '4, 4',
          fillColor: '#22c55e',
          fillOpacity: 0.08
        }
      }).addTo(mainLayerGroupRef.current);

      map.fitBounds(geoLayer.getBounds(), { padding: [40, 40] });
    }
  }, [mainPolygon]);

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
    edges.forEach((edge) => {
      const isSelected = selectedFrontageEdgeIndex === edge.index;
      const isSelecting = isSelectingFrontageEdge;

      // Only draw if selecting mode is active, or if this edge is selected
      if (!isSelecting && !isSelected) return;

      const latlngs: [number, number][] = [
        [edge.p1[1], edge.p1[0]],
        [edge.p2[1], edge.p2[0]]
      ];

      const polyline = L.polyline(latlngs, {
        pane: 'roadPane',
        color: isSelected ? '#f59e0b' : '#38bdf8',
        weight: isSelected ? 6 : 4,
        dashArray: isSelected ? undefined : '6, 6',
        opacity: isSelected ? 1 : 0.85
      }).addTo(frontageEdgeGroupRef.current!);

      if (isSelecting) {
        polyline.bindTooltip(`Tıkla: Yol Cephesi Yap (#${edge.index + 1} - ${edge.lengthM}m)`, {
          sticky: true,
          direction: 'top',
          className: 'bg-slate-900/90 text-white font-semibold text-[11px] px-2 py-1 rounded-md border border-sky-400'
        });

        polyline.on('mouseover', () => {
          polyline.setStyle({ weight: 7, color: '#f59e0b', opacity: 1 });
        });
        polyline.on('mouseout', () => {
          polyline.setStyle({
            weight: isSelected ? 6 : 4,
            color: isSelected ? '#f59e0b' : '#38bdf8',
            opacity: isSelected ? 1 : 0.85
          });
        });
        polyline.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (onSelectFrontageEdge) {
            onSelectFrontageEdge(edge.index);
          }
        });
      } else if (isSelected) {
        polyline.bindTooltip(`🛣️ Seçili Yol Cephesi (#${edge.index + 1} - ${edge.lengthM}m)`, {
          permanent: true,
          direction: 'center',
          className: 'bg-amber-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded shadow-lg border border-amber-300'
        });
      }
    });
  }, [mainPolygon, isSelectingFrontageEdge, selectedFrontageEdgeIndex, onSelectFrontageEdge]);

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
          fillOpacity: mapSettings.showFill ? (isSelected ? 0.75 : 0.45) : 0,
          dashArray: mapSettings.cadModeActive ? '4, 2' : undefined
        }
      }).addTo(piecesLayerGroupRef.current);

      // Tooltip content
      const labelParts: string[] = [];
      if (mapSettings.showNames) labelParts.push(`<b>${p.name}</b>`);
      if (mapSettings.showAreas) labelParts.push(`${p.areaM2.toFixed(1)} m²`);

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
                onDragMerge(idx, targetIdx);
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
            while (angleDeg < -90) angleDeg += 180;

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
    onParcelGeometryUpdated
  ]);

  return (
    <div className="relative w-full h-full">
      <div id="map-element" className="w-full h-full bg-slate-900" />

      {/* Floating Status Bar for Road Frontage Draw / Select */}
      {(isDrawingRoadFrontage || isSelectingFrontageEdge) && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] h-10 px-4 bg-amber-500 text-slate-950 font-semibold rounded-full flex items-center gap-3 shadow-[0_12px_36px_rgba(245,158,11,0.4)] animate-in fade-in slide-in-from-top-2">
          {isDrawingRoadFrontage ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <Navigation className="w-4 h-4 stroke-[2.5] animate-pulse" />
                <span>Yol Cephesi Çizimi Aktif: Haritaya tıklayarak yol hattını çizin</span>
              </div>
              {onDoneDrawingRoadFrontage && (
                <button
                  onClick={onDoneDrawingRoadFrontage}
                  className="w-5 h-5 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center transition ml-1"
                  title="İptal Et"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs">
                <Compass className="w-4 h-4 stroke-[2.5] animate-pulse" />
                <span>Yol Cephesi Seçimi Aktif: Parselin yol kenarına haritada tıklayın</span>
              </div>
              {onSelectFrontageEdge && (
                <button
                  onClick={() => onSelectFrontageEdge(-1)}
                  className="w-5 h-5 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center transition ml-1"
                  title="İptal Et"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              )}
            </>
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
      {mapSettings.cadModeActive && showVertexTable && cadActiveParcel && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[520px] max-w-[95vw] apple-glass rounded-2xl p-4 shadow-[0_24px_64px_rgba(0,0,0,0.6)] border border-white/10 text-xs space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
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
