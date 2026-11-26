import { useEffect, useRef } from 'react';
import L from 'leaflet';

const DEFAULT_CENTER = [18.5204, 73.8567]; // Pune

function makePin(text, color = '#0F172A', ring = '#FFFFFF') {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid ${ring};color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">${text}</div>`,
  });
}

/* Displays all stops of a campaign route with numbered markers, radius circles, and connecting polyline */
export function RouteMap({ stops = [], height = 340 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!elRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 180);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = [];
    const pts = [];
    stops.forEach((s) => {
      if (s.latitude == null || s.longitude == null) return;
      const ll = [+s.latitude, +s.longitude];
      pts.push(ll);
      const m = L.marker(ll, { icon: makePin(s.seq, '#059669') })
        .bindPopup(`<b>${s.seq}. ${s.name}</b><br/><span style="font-size:12px">${s.address || ''}</span>`)
        .addTo(map);
      const c = L.circle(ll, { radius: s.radius_m || 200, color: '#059669', fillOpacity: 0.08, weight: 1.5 }).addTo(map);
      layers.push(m, c);
    });
    if (pts.length > 1) {
      layers.push(L.polyline(pts, { color: '#0F172A', weight: 3, dashArray: '6 6', opacity: 0.75 }).addTo(map));
    }
    if (pts.length) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
    return () => layers.forEach((l) => l.remove());
  }, [stops]);

  return <div ref={elRef} className="leaflet-wrap" style={{ height }} />;
}

/* Interactive map picker for dropping or dragging a stop pin + radius preview */
export function StopPinPicker({ lat, lng, radius = 200, onPick, height = 240 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef({ marker: null, circle: null });

  useEffect(() => {
    if (!elRef.current) return;
    const hasCoords = lat != null && lng != null && !isNaN(+lat) && !isNaN(+lng);
    const center = hasCoords ? [+lat, +lng] : DEFAULT_CENTER;
    const map = L.map(elRef.current).setView(center, hasCoords ? 15 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 180);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; layerRef.current = { marker: null, circle: null }; };
  }, []); // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current.marker) { layerRef.current.marker.remove(); layerRef.current.marker = null; }
    if (layerRef.current.circle) { layerRef.current.circle.remove(); layerRef.current.circle = null; }
    const hasCoords = lat != null && lng != null && lat !== '' && lng !== '' && !isNaN(+lat) && !isNaN(+lng);
    if (!hasCoords) return;
    const ll = [+lat, +lng];
    const m = L.marker(ll, { draggable: true, icon: makePin('P', '#F59E0B', '#0F172A') }).addTo(map);
    m.on('dragend', () => {
      const p = m.getLatLng();
      onPick(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
    });
    const c = L.circle(ll, { radius: Math.max(20, +radius || 200), color: '#059669', fillOpacity: 0.12, weight: 1.5 }).addTo(map);
    layerRef.current = { marker: m, circle: c };
    map.panTo(ll);
  }, [lat, lng, radius]); // eslint-disable-line

  return <div ref={elRef} className="leaflet-wrap" style={{ height }} />;
}

/* Visit review map: shows planned stop circle + each photo's actual GPS pin */
export function VisitMap({ stop, photos = [], height = 220 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!elRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 180);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = [];
    const pts = [];
    if (stop?.latitude != null && stop?.longitude != null) {
      const sll = [+stop.latitude, +stop.longitude];
      pts.push(sll);
      layers.push(L.circle(sll, { radius: stop.radius_m || 200, color: '#0284C7', fillOpacity: 0.1, weight: 1.5 }).addTo(map));
      layers.push(L.marker(sll, { icon: makePin('S', '#0284C7') }).bindPopup('<b>Planned Stop</b>').addTo(map));
    }
    photos.forEach((p, idx) => {
      const pll = [+p.latitude, +p.longitude];
      pts.push(pll);
      const color = p.within_radius === 0 ? '#DC2626' : '#059669';
      layers.push(
        L.marker(pll, { icon: makePin(idx + 1, color) })
          .bindPopup(`<b>${p.type.toUpperCase()}</b>${p.distance_m != null ? `<br/>${p.distance_m} m from stop` : ''}`)
          .addTo(map)
      );
    });
    if (pts.length) map.fitBounds(pts, { padding: [32, 32], maxZoom: 16 });
    return () => layers.forEach((l) => l.remove());
  }, [stop, photos]);

  return <div ref={elRef} className="leaflet-wrap" style={{ height }} />;
}
