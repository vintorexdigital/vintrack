'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';

export interface MapMarker { id: string; lat: number; lng: number; label: string; tone?: 'present' | 'late' | 'absent' | 'muted'; selected?: boolean }
export interface MapProps {
  markers?: MapMarker[];
  line?: { lat: number; lng: number }[];
  stops?: { lat: number; lng: number; label: string }[];
  onSelect?: (id: string) => void;
  className?: string;
  label: string;
}

const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const COLOR = { present: '#1f7a4d', late: '#b7791f', absent: '#b42318', muted: '#64748b' };

/** Thin Leaflet wrapper. Leaflet touches `window`, so it is loaded on the client only. */
export function TrackMap({ markers = [], line, stops = [], onSelect, className, label }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    let dead = false;
    void import('leaflet').then((L) => {
      if (dead || !el.current || map.current) return;
      map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([20.5, 78.9], 4);
      L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setReady(true);
    });
    return () => { dead = true; map.current?.remove(); map.current = null; layer.current = null; setReady(false); };
  }, []);

  useEffect(() => {
    let dead = false;
    void import('leaflet').then((L) => {
      const m = map.current;
      const g = layer.current;
      if (dead || !m || !g) return;
      g.clearLayers();
      const pts: [number, number][] = [];
      if (line?.length) {
        L.polyline(line.map((p) => [p.lat, p.lng] as [number, number]), { color: '#0b6f78', weight: 4, opacity: 0.85 }).addTo(g);
        line.forEach((p) => pts.push([p.lat, p.lng]));
      }
      for (const s of stops) {
        L.circleMarker([s.lat, s.lng], { radius: 8, color: '#b7791f', fillColor: '#f6b93b', fillOpacity: 0.9, weight: 2 }).bindTooltip(s.label).addTo(g);
        pts.push([s.lat, s.lng]);
      }
      for (const k of markers) {
        const c = COLOR[k.tone ?? 'muted'];
        const mk = L.circleMarker([k.lat, k.lng], { radius: k.selected ? 11 : 8, color: '#ffffff', weight: 2, fillColor: c, fillOpacity: 1 }).bindTooltip(k.label);
        mk.on('click', () => select.current?.(k.id));
        mk.addTo(g);
        pts.push([k.lat, k.lng]);
      }
      if (pts.length) m.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    });
    return () => { dead = true; };
  }, [ready, markers, line, stops]);

  return <div ref={el} role="region" aria-label={label} className={className ?? 'h-96 w-full rounded-card border border-rule'} />;
}
