import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { money } from './api';
import { useApp } from './context';

export interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  title: string;
  price?: number;
  link?: string;
}

interface Props {
  points: MapPoint[];
  activeId?: number | null;
  height?: number | string;
  zoom?: number;
}

/**
 * Карта готелів: Google Maps JS API, якщо задано GOOGLE_MAPS_API_KEY,
 * інакше — OpenStreetMap через Leaflet (без ключа).
 */
export default function HotelMap(props: Props) {
  const { config } = useApp();
  return config.googleMapsKey ? (
    <GoogleHotelMap {...props} apiKey={config.googleMapsKey} />
  ) : (
    <LeafletHotelMap {...props} />
  );
}

// ---------------- Leaflet / OpenStreetMap ----------------

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.map((p) => p.id).join(',');
  useEffect(() => {
    if (!points.length) return;
    const fit = () => {
      // Контейнер міг мати нульовий розмір при першому рендері — перераховуємо
      map.invalidateSize();
      if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
      else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 14 });
    };
    fit();
    // Leaflet слухає лише resize вікна; зміни розміру контейнера (grid, мобільна верстка) ловимо самі
    let last = map.getContainer().clientWidth;
    const ro = new ResizeObserver(() => {
      const w = map.getContainer().clientWidth;
      if (Math.abs(w - last) > 20) fit();
      else map.invalidateSize();
      last = w;
    });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function priceIcon(label: string, active: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin ${active ? 'active' : ''}">${label}</div>`,
    iconSize: null as unknown as L.PointExpression, // розмір задає CSS
    iconAnchor: [30, 34],
  });
}

function LeafletHotelMap({ points, activeId, height = 420, zoom = 6 }: Props) {
  const nav = useNavigate();
  const center = useMemo<[number, number]>(() => (points[0] ? [points[0].lat, points[0].lng] : [49.0, 31.4]), [points]);
  return (
    <div className="map" style={{ height }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          referrerPolicy="strict-origin-when-cross-origin" // OSM вимагає Referer, інакше 403
        />
        <FitBounds points={points} />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={priceIcon(p.price ? money(p.price) : '●', p.id === activeId)}
            zIndexOffset={p.id === activeId ? 1000 : 0}
            eventHandlers={{ click: () => p.link && nav(p.link) }}
          >
            <Tooltip direction="top" offset={[0, -30]}>
              {p.title}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// ---------------- Google Maps ----------------

declare global {
  interface Window {
    google?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    __gmapsLoading?: Promise<void>;
  }
}

function loadGoogle(key: string) {
  if (window.google?.maps) return Promise.resolve();
  if (!window.__gmapsLoading) {
    window.__gmapsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google Maps не завантажився'));
      document.head.appendChild(s);
    });
  }
  return window.__gmapsLoading;
}

function GoogleHotelMap({ points, activeId, height = 420, zoom = 6, apiKey }: Props & { apiKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const markers = useRef<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const nav = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogle(apiKey)
      .then(() => {
        if (cancelled || !el.current) return;
        const g = window.google.maps;
        if (!mapRef.current) mapRef.current = new g.Map(el.current, { center: { lat: 49, lng: 31.4 }, zoom });
        markers.current.forEach((m) => m.setMap(null));
        const bounds = new g.LatLngBounds();
        markers.current = points.map((p) => {
          const m = new g.Marker({
            position: { lat: p.lat, lng: p.lng },
            map: mapRef.current,
            title: p.title,
            label: p.price ? { text: money(p.price), fontSize: '11px', fontWeight: '700' } : undefined,
            zIndex: p.id === activeId ? 1000 : 1,
          });
          if (p.link) m.addListener('click', () => nav(p.link!));
          bounds.extend(m.getPosition());
          return m;
        });
        if (points.length > 1) mapRef.current.fitBounds(bounds);
        else if (points.length === 1) {
          mapRef.current.setCenter({ lat: points[0].lat, lng: points[0].lng });
          mapRef.current.setZoom(15);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [apiKey, points, activeId, zoom, nav]);

  if (failed) return <LeafletHotelMap points={points} activeId={activeId} height={height} zoom={zoom} />;
  return <div ref={el} className="map" style={{ height }} />;
}
